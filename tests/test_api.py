"""Pruebas de la API contra un servidor en ejecucion.

    BASE_URL=http://localhost:8000 pytest -v tests/

Incluye la prueba de concurrencia del RNF de sobreventa: N clientes liberados a la vez
por una barrera intentan reservar un vuelo con K sillas; deben salir exactamente K 201
y N-K 409, nunca un 5xx.
"""
import os
import threading
import uuid

import httpx
import pytest

BASE = os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/")
ROUTE = "BOG-MDE"
DATE = "2030-01-15"
N_CLIENTS = 50
ROUNDS = 5


def make_flight(capacity, date=DATE, route=ROUTE):
    fid = "T" + uuid.uuid4().hex[:10].upper()
    r = httpx.post(f"{BASE}/admin/flights", json={
        "flight_id": fid, "route": route, "flight_date": date, "capacity": capacity, "price_cents": 250000})
    assert r.status_code == 201, r.text
    return fid


def reserve(client, fid, name="Ana Gomez", fare="ECONOMY"):
    return client.post(f"{BASE}/reservations", json={"flight_id": fid, "passenger_name": name, "fare_class": fare})


def seats_available(fid, date=DATE):
    o, d = ROUTE.split("-")
    r = httpx.get(f"{BASE}/flights/search", params={"origin": o, "destination": d, "date": date})
    assert r.status_code == 200
    return next((f["seats_available"] for f in r.json() if f["flight_id"] == fid), 0)


def race(capacity, n):
    """Lanza n reservas simultaneas sobre un vuelo nuevo con `capacity` sillas."""
    fid = make_flight(capacity)
    barrier = threading.Barrier(n)
    codes = [None] * n
    clients = [httpx.Client(timeout=30) for _ in range(n)]

    def go(i):
        barrier.wait()
        try:
            codes[i] = reserve(clients[i], fid, f"Pasajero {i}").status_code
        except httpx.HTTPError:
            codes[i] = -1

    threads = [threading.Thread(target=go, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    for c in clients:
        c.close()
    return fid, codes


def test_health():
    assert httpx.get(f"{BASE}/health").status_code == 200


def test_create_flight_twice_is_409():
    fid = make_flight(10)
    r = httpx.post(f"{BASE}/admin/flights", json={
        "flight_id": fid, "route": ROUTE, "flight_date": DATE, "capacity": 10, "price_cents": 1})
    assert r.status_code == 409


def test_search_returns_flight():
    fid = make_flight(150, date="2030-02-01")
    r = httpx.get(f"{BASE}/flights/search", params={"origin": "BOG", "destination": "MDE", "date": "2030-02-01"})
    assert r.status_code == 200
    flight = next(f for f in r.json() if f["flight_id"] == fid)
    assert flight == {"flight_id": fid, "route": ROUTE, "flight_date": "2030-02-01",
                      "seats_available": 150, "price_cents": 250000}


def test_search_bad_params_is_422():
    r = httpx.get(f"{BASE}/flights/search", params={"origin": "bogota", "destination": "MDE", "date": DATE})
    assert r.status_code == 422


def test_reservation_roundtrip():
    fid = make_flight(5)
    with httpx.Client() as c:
        r = reserve(c, fid)
        assert r.status_code == 201
        body = r.json()
        assert body["status"] == "CONFIRMED" and body["flight_id"] == fid
        g = c.get(f"{BASE}/reservations/{body['reservation_id']}")
        assert g.status_code == 200 and g.json() == body
    assert seats_available(fid) == 4


def test_unknown_reservation_is_404():
    assert httpx.get(f"{BASE}/reservations/no-existe-{uuid.uuid4().hex}").status_code == 404


def test_unknown_flight_is_404():
    with httpx.Client() as c:
        assert reserve(c, "NO-EXISTE").status_code == 404


def test_cancel_returns_seat():
    fid = make_flight(1)
    with httpx.Client() as c:
        rid = reserve(c, fid).json()["reservation_id"]
        assert reserve(c, fid).status_code == 409
        r = c.post(f"{BASE}/reservations/{rid}/cancel")
        assert r.status_code == 200 and r.json()["status"] == "CANCELLED"
        assert c.post(f"{BASE}/reservations/{rid}/cancel").status_code == 409
        assert reserve(c, fid).status_code == 201


def test_multi_leg_itinerary_is_all_or_nothing():
    first = make_flight(3, route="MDE-BOG")
    second = make_flight(1, route="BOG-SMR")
    body = {"flight_id": first, "passenger_name": "Luis Perez", "fare_class": "ECONOMY",
            "connection_flight_ids": [second]}
    with httpx.Client() as c:
        r = c.post(f"{BASE}/reservations", json=body)
        assert r.status_code == 201 and r.json()["flight_id"] == first
        # El segundo tramo quedo sin sillas: la reserva completa falla y el primero no pierde silla.
        assert c.post(f"{BASE}/reservations", json=body).status_code == 409
        o, d = "MDE", "BOG"
        seats = httpx.get(f"{BASE}/flights/search", params={"origin": o, "destination": d, "date": DATE}).json()
        assert next(f["seats_available"] for f in seats if f["flight_id"] == first) == 2
        # En orden invertido los tramos no conectan (llega a SMR, sale de MDE) -> 422
        bad = dict(body, flight_id=second, connection_flight_ids=[first])
        assert c.post(f"{BASE}/reservations", json=bad).status_code == 422


@pytest.mark.parametrize("capacity", [1, 5])
def test_concurrency_exactly_k(capacity):
    for rnd in range(1, ROUNDS + 1):
        fid, codes = race(capacity, N_CLIENTS)
        ok, conflict = codes.count(201), codes.count(409)
        print(f"capacidad={capacity} ronda={rnd}: {N_CLIENTS} peticiones -> 201={ok} 409={conflict} "
              f"otros={N_CLIENTS - ok - conflict}")
        assert ok == capacity, f"se crearon {ok} reservas para {capacity} sillas"
        assert conflict == N_CLIENTS - capacity, f"codigos inesperados: {sorted(set(codes))}"
        assert seats_available(fid) == 0
