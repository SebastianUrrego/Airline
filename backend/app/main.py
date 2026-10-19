import uuid
from contextlib import asynccontextmanager
from datetime import date
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from .db import init_schema, pool

IATA = r"^[A-Z]{3}$"
ROUTE = r"^[A-Z]{3}-[A-Z]{3}$"


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open(wait=True)
    init_schema()
    yield
    pool.close()


app = FastAPI(title="Airline Reservation API", lifespan=lifespan)


class FlightIn(BaseModel):
    flight_id: str = Field(min_length=1, max_length=32)
    route: str = Field(pattern=ROUTE)
    flight_date: date
    capacity: int = Field(gt=0)
    price_cents: int = Field(gt=0)


class ReservationIn(BaseModel):
    flight_id: str = Field(min_length=1, max_length=32)
    passenger_name: str = Field(min_length=1, max_length=120)
    fare_class: Literal["ECONOMY", "BUSINESS"]
    # Tramos siguientes del itinerario (escalas), en orden. Vacio = vuelo directo.
    connection_flight_ids: list[str] = Field(default_factory=list, max_length=3)
    document_id: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=120)


RESERVATION_SQL = """
    SELECT r.reservation_id, s.flight_id, r.status, p.full_name
    FROM reservations r
    JOIN passengers p USING (passenger_id)
    JOIN reservation_segments s ON s.reservation_id = r.reservation_id AND s.segment_no = 1
    WHERE r.reservation_id = %s
"""


def fetch_reservation(conn, reservation_id: str) -> dict | None:
    row = conn.execute(RESERVATION_SQL, (reservation_id,)).fetchone()
    if row is None:
        return None
    rid, flight_id, status, passenger_name = row
    return {"reservation_id": rid, "flight_id": flight_id, "status": status, "passenger_name": passenger_name}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/admin/flights", status_code=201)
def create_flight(body: FlightIn):
    origin, destination = body.route.split("-")
    if origin == destination:
        raise HTTPException(422, "origin and destination must differ")
    with pool.connection() as conn:
        conn.execute("INSERT INTO airports (code) VALUES (%s), (%s) ON CONFLICT DO NOTHING",
                     (origin, destination))
        conn.execute("INSERT INTO routes (route_code, origin, destination) VALUES (%s, %s, %s) "
                     "ON CONFLICT DO NOTHING", (body.route, origin, destination))
        row = conn.execute(
            "INSERT INTO flights (flight_id, route_code, flight_date, capacity, seats_available, price_cents) "
            "VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (flight_id) DO NOTHING RETURNING flight_id",
            (body.flight_id, body.route, body.flight_date, body.capacity, body.capacity, body.price_cents),
        ).fetchone()
    if row is None:
        raise HTTPException(409, "flight_id already exists")
    return body.model_dump(mode="json")


@app.get("/flights/search")
def search_flights(origin: str = Query(pattern=IATA),
                   destination: str = Query(pattern=IATA),
                   date: date = Query()):
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT flight_id, route_code, flight_date, seats_available, price_cents FROM flights "
            "WHERE route_code = %s AND flight_date = %s AND seats_available > 0 ORDER BY flight_id",
            (f"{origin}-{destination}", date),
        ).fetchall()
    return [{"flight_id": f, "route": r, "flight_date": d.isoformat(), "seats_available": s, "price_cents": p}
            for f, r, d, s, p in rows]


@app.post("/reservations", status_code=201)
def create_reservation(body: ReservationIn):
    legs = [body.flight_id, *body.connection_flight_ids]
    if len(set(legs)) != len(legs):
        raise HTTPException(422, "a flight appears twice in the itinerary")
    reservation_id = "R" + uuid.uuid4().hex[:16].upper()

    with pool.connection() as conn:  # una transaccion: commit al salir, rollback si hay excepcion
        rows = conn.execute(
            "SELECT f.flight_id, r.origin, r.destination, f.flight_date "
            "FROM flights f JOIN routes r USING (route_code) WHERE f.flight_id = ANY(%s)", (legs,),
        ).fetchall()
        info = {flight_id: (origin, destination, day) for flight_id, origin, destination, day in rows}
        if len(info) != len(legs):
            raise HTTPException(404, "flight not found")
        for prev, nxt in zip(legs, legs[1:]):
            if info[prev][1] != info[nxt][0] or info[prev][2] > info[nxt][2]:
                raise HTTPException(422, f"{nxt} does not connect with {prev}")
        days_before = (info[legs[0]][2] - date.today()).days
        if days_before < 0:
            raise HTTPException(409, "flight already departed")

        # Control de sobreventa: UPDATE condicional y atomico por tramo. PostgreSQL bloquea la fila
        # del vuelo; las peticiones concurrentes esperan y, al liberarse, vuelven a evaluar
        # seats_available > 0. Con K sillas, exactamente K peticiones obtienen fila y las demas 409.
        # Los vuelos se bloquean siempre en el mismo orden (sorted) para evitar interbloqueos
        # entre itinerarios con escalas; si un tramo no tiene sillas, el rollback libera los demas.
        base_price = {}
        for flight_id in sorted(legs):
            row = conn.execute(
                "UPDATE flights SET seats_available = seats_available - 1 "
                "WHERE flight_id = %s AND seats_available > 0 RETURNING price_cents",
                (flight_id,),
            ).fetchone()
            if row is None:
                raise HTTPException(409, "no seats available")
            base_price[flight_id] = row[0]

        fare_rule_id, multiplier = conn.execute(
            "SELECT fare_rule_id, multiplier FROM fare_rules "
            "WHERE fare_class = %s AND min_days_before <= %s ORDER BY min_days_before DESC LIMIT 1",
            (body.fare_class, days_before),
        ).fetchone()
        prices = [round(base_price[flight_id] * multiplier) for flight_id in legs]
        total = sum(prices)

        (passenger_id,) = conn.execute(
            "INSERT INTO passengers (full_name, document_id, email) VALUES (%s, %s, %s) RETURNING passenger_id",
            (body.passenger_name, body.document_id, body.email),
        ).fetchone()
        conn.execute(
            "INSERT INTO reservations (reservation_id, passenger_id, fare_rule_id, status, total_price_cents) "
            "VALUES (%s, %s, %s, 'CONFIRMED', %s)",
            (reservation_id, passenger_id, fare_rule_id, total),
        )
        conn.cursor().executemany(
            "INSERT INTO reservation_segments (reservation_id, segment_no, flight_id, price_cents) "
            "VALUES (%s, %s, %s, %s)",
            [(reservation_id, n, flight_id, price) for n, (flight_id, price) in enumerate(zip(legs, prices), 1)],
        )
        # Cobro simulado: en produccion aqui se guardaria la respuesta de la pasarela de pagos.
        conn.execute(
            "INSERT INTO payments (reservation_id, amount_cents, provider, provider_ref, status) "
            "VALUES (%s, %s, 'SIMULADO', %s, 'APPROVED')",
            (reservation_id, total, "SIM-" + uuid.uuid4().hex[:12].upper()),
        )
    return {"reservation_id": reservation_id, "flight_id": body.flight_id,
            "status": "CONFIRMED", "passenger_name": body.passenger_name}


@app.get("/reservations/{reservation_id}")
def get_reservation(reservation_id: str):
    with pool.connection() as conn:
        reservation = fetch_reservation(conn, reservation_id)
    if reservation is None:
        raise HTTPException(404, "reservation not found")
    return reservation


@app.post("/reservations/{reservation_id}/cancel")
def cancel_reservation(reservation_id: str):
    with pool.connection() as conn:
        row = conn.execute(
            "UPDATE reservations SET status = 'CANCELLED', updated_at = now() "
            "WHERE reservation_id = %s AND status = 'CONFIRMED' RETURNING reservation_id",
            (reservation_id,),
        ).fetchone()
        if row is None:
            if fetch_reservation(conn, reservation_id) is None:
                raise HTTPException(404, "reservation not found")
            raise HTTPException(409, "reservation already cancelled")
        # Las sillas de todos los tramos vuelven al inventario en la misma transaccion,
        # bloqueando los vuelos en el mismo orden que create_reservation.
        legs = conn.execute("SELECT flight_id FROM reservation_segments WHERE reservation_id = %s "
                            "ORDER BY flight_id", (reservation_id,)).fetchall()
        for (flight_id,) in legs:
            conn.execute("UPDATE flights SET seats_available = seats_available + 1 WHERE flight_id = %s",
                         (flight_id,))
        conn.execute("UPDATE payments SET status = 'REFUNDED' WHERE reservation_id = %s", (reservation_id,))
        return fetch_reservation(conn, reservation_id)
