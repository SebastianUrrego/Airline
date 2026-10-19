"""Dibuja el diagrama entidad-relacion (notacion Crow's Foot) de backend/schema.sql.

    python docs/diagrama_er.py      ->  docs/diagrama_er.png y docs/diagrama_er.svg
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle

W, HEADER, ROW = 5.6, 0.6, 0.42
INK, HEAD, KEYC, TYPEC = "#1F2933", "#1F4E79", "#B54708", "#6B7280"
COLS = {0: 0.0, 1: 8.2, 2: 16.4, 3: 24.6}

# tabla fisica: (nombre en el diagrama, columna, borde superior, [(llave, atributo, tipo)])
# El diagrama usa nombres en espanol; sobre cada caja va el nombre real de la tabla en schema.sql.
ENTITIES = {
    "airports": ("AEROPUERTOS", 0, 0.0, [("PK", "codigo", "CHAR(3)"), ("", "ciudad", "VARCHAR(80)")]),
    "routes": ("RUTAS", 0, -4.6, [("PK", "codigo_ruta", "VARCHAR(7)"), ("FK", "origen", "CHAR(3)"),
                                  ("FK", "destino", "CHAR(3)")]),
    "scheduled_flights": ("VUELOS_PROGRAMADOS", 1, 0.0, [
        ("PK", "numero_vuelo", "VARCHAR(8)"), ("FK", "codigo_ruta", "VARCHAR(7)"),
        ("", "hora_salida", "TIME"), ("", "dias_semana", "VARCHAR(7)"), ("FK", "id_avion", "VARCHAR(10)")]),
    "flights": ("VUELOS", 1, -4.0, [
        ("PK", "id_vuelo", "VARCHAR(32)"), ("FK", "numero_vuelo", "VARCHAR(8)"),
        ("FK", "codigo_ruta", "VARCHAR(7)"), ("FK", "id_avion", "VARCHAR(10)"),
        ("", "fecha_vuelo", "DATE"), ("", "capacidad", "INT"),
        ("", "sillas_disponibles", "INT"), ("", "precio_centavos", "BIGINT"),
        ("", "fecha_creacion", "TIMESTAMPTZ")]),
    "aircraft": ("AVIONES", 2, 0.0, [("PK", "id_avion", "VARCHAR(10)"), ("", "modelo", "VARCHAR(40)"),
                                     ("", "capacidad", "INT")]),
    "reservation_segments": ("TRAMOS_RESERVA", 2, -5.6, [
        ("PK FK", "id_reserva", "VARCHAR(40)"), ("PK", "numero_tramo", "SMALLINT"),
        ("FK", "id_vuelo", "VARCHAR(32)"), ("", "precio_centavos", "BIGINT")]),
    "payments": ("PAGOS", 2, -9.6, [
        ("PK", "id_pago", "BIGSERIAL"), ("FK UQ", "id_reserva", "VARCHAR(40)"),
        ("", "monto_centavos", "BIGINT"), ("", "proveedor", "VARCHAR(30)"),
        ("", "referencia_proveedor", "VARCHAR(64)"), ("", "estado", "VARCHAR(10)"),
        ("", "fecha_creacion", "TIMESTAMPTZ")]),
    "fare_rules": ("REGLAS_TARIFA", 3, 0.0, [
        ("PK", "id_regla", "SMALLINT"), ("", "clase_tarifa", "VARCHAR(10)"),
        ("", "dias_anticipacion", "INT"), ("", "multiplicador", "NUMERIC(4,2)")]),
    "reservations": ("RESERVAS", 3, -4.0, [
        ("PK", "id_reserva", "VARCHAR(40)"), ("FK", "id_pasajero", "BIGINT"),
        ("FK", "id_regla", "SMALLINT"), ("", "estado", "VARCHAR(10)"),
        ("", "precio_total_centavos", "BIGINT"), ("", "fecha_creacion", "TIMESTAMPTZ"),
        ("", "fecha_actualizacion", "TIMESTAMPTZ")]),
    "passengers": ("PASAJEROS", 3, -9.6, [
        ("PK", "id_pasajero", "BIGSERIAL"), ("", "nombre_completo", "VARCHAR(120)"),
        ("", "documento", "VARCHAR(20)"), ("", "correo", "VARCHAR(120)")]),
}

UP, DOWN, LEFT, RIGHT = (0, 1), (0, -1), (-1, 0), (1, 0)

# (extremo padre, direccion, simbolo), (extremo hijo, direccion, simbolo), puntos intermedios, etiqueta, pos.
RELATIONS = [
    (((1.8, -1.44), DOWN, "one"), ((1.8, -4.6), UP, "zero_many"), [], "origen", (1.95, -3.0)),
    (((3.8, -1.44), DOWN, "one"), ((3.8, -4.6), UP, "zero_many"), [], "destino", (3.95, -3.0)),
    (((5.6, -4.9), RIGHT, "one"), ((8.2, -1.2), LEFT, "zero_many"), [(7.0, -4.9), (7.0, -1.2)],
     "se programa en", (5.75, -2.6)),
    (((5.6, -5.6), RIGHT, "one"), ((8.2, -5.6), LEFT, "zero_many"), [], "se opera en", (5.85, -5.9)),
    (((11.0, -2.7), DOWN, "zero_one"), ((11.0, -4.0), UP, "zero_many"), [], "genera", (11.15, -3.35)),
    (((16.4, -1.0), LEFT, "zero_one"), ((13.8, -1.0), RIGHT, "zero_many"), [], "asignado a", (14.2, -0.75)),
    (((17.2, -1.86), DOWN, "zero_one"), ((13.8, -4.5), RIGHT, "zero_many"), [(17.2, -4.5)],
     "opera", (17.35, -3.2)),
    (((13.8, -6.6), RIGHT, "one"), ((16.4, -6.6), LEFT, "zero_many"), [], "ocupado por", (14.0, -6.35)),
    (((24.6, -6.6), LEFT, "one"), ((22.0, -6.6), RIGHT, "one_many"), [], "compuesta por", (22.35, -6.35)),
    (((27.4, -2.28), DOWN, "one"), ((27.4, -4.0), UP, "zero_many"), [], "tarifa", (27.55, -3.15)),
    (((27.4, -9.6), UP, "one"), ((27.4, -7.54), DOWN, "zero_many"), [], "hace", (27.55, -8.6)),
    (((25.4, -7.54), DOWN, "one"), ((19.2, -9.6), UP, "zero_one"), [(25.4, -8.7), (19.2, -8.7)],
     "se paga con", (21.6, -8.45)),
]


def draw_entity(ax, table, name, col, top, rows):
    x, h = COLS[col], HEADER + ROW * len(rows)
    ax.add_patch(Rectangle((x, top - h), W, h, facecolor="white", edgecolor=HEAD, lw=1.4, zorder=3))
    ax.add_patch(Rectangle((x, top - HEADER), W, HEADER, facecolor=HEAD, edgecolor=HEAD, lw=1.4, zorder=3))
    ax.text(x + W / 2, top - HEADER / 2, name, ha="center", va="center", color="white",
            fontsize=10, weight="bold", zorder=4)
    ax.text(x + W, top + 0.08, f"tabla {table}", ha="right", va="bottom", fontsize=7, style="italic",
            color=TYPEC, zorder=4)
    for i, (key, column, sqltype) in enumerate(rows):
        y = top - HEADER - ROW * (i + 0.5)
        if i:
            ax.plot([x, x + W], [y + ROW / 2] * 2, color="#E5E7EB", lw=0.6, zorder=4)
        ax.text(x + 0.12, y, key, ha="left", va="center", fontsize=7.5, color=KEYC, weight="bold", zorder=4)
        ax.text(x + 1.0, y, column, ha="left", va="center", fontsize=8.5, color=INK, zorder=4,
                weight="bold" if "PK" in key else "normal")
        ax.text(x + W - 0.12, y, sqltype, ha="right", va="center", fontsize=7.5, color=TYPEC, zorder=4)


def draw_end(ax, point, d, kind):
    """Simbolo de cardinalidad; d apunta desde la entidad hacia afuera, a lo largo de la linea."""
    (px, py), (dx, dy) = point, d
    nx, ny = -dy, dx

    def at(t, s=0.0):
        return px + dx * t + nx * s, py + dy * t + ny * s

    def bar(t):
        (x1, y1), (x2, y2) = at(t, -0.17), at(t, 0.17)
        ax.plot([x1, x2], [y1, y2], color=INK, lw=1.3, zorder=5)

    def circle(t):
        ax.add_patch(Circle(at(t), 0.1, facecolor="white", edgecolor=INK, lw=1.3, zorder=6))

    def crow():
        tip = at(0.38)
        for s in (-0.2, 0.0, 0.2):
            foot = at(0, s)
            ax.plot([tip[0], foot[0]], [tip[1], foot[1]], color=INK, lw=1.3, zorder=5)

    if kind == "one":            # exactamente uno
        bar(0.18), bar(0.32)
    elif kind == "zero_one":     # cero o uno
        bar(0.18), circle(0.42)
    elif kind == "one_many":     # uno o muchos
        crow(), bar(0.5)
    elif kind == "zero_many":    # cero o muchos
        crow(), circle(0.55)


def draw_legend(ax, x, top):
    ax.text(x, top, "Notación Crow's Foot", fontsize=10, weight="bold", color=INK, va="top")
    items = [("one", "exactamente uno"), ("zero_one", "cero o uno"),
             ("one_many", "uno o muchos"), ("zero_many", "cero o muchos")]
    for i, (kind, label) in enumerate(items):
        y = top - 0.75 - i * 0.6
        ax.plot([x, x + 1.4], [y, y], color=INK, lw=1.2, zorder=4)
        draw_end(ax, (x, y), RIGHT, kind)
        ax.text(x + 1.7, y, label, va="center", fontsize=8.5, color=INK)
    y = top - 0.75 - 4 * 0.6
    ax.text(x, y, "PK", fontsize=7.5, color=KEYC, weight="bold", va="center")
    ax.text(x + 0.55, y, "llave primaria    ", fontsize=8.5, color=INK, va="center")
    ax.text(x + 2.6, y, "FK", fontsize=7.5, color=KEYC, weight="bold", va="center")
    ax.text(x + 3.15, y, "llave foránea    ", fontsize=8.5, color=INK, va="center")
    ax.text(x + 5.1, y, "UQ", fontsize=7.5, color=KEYC, weight="bold", va="center")
    ax.text(x + 5.65, y, "única", fontsize=8.5, color=INK, va="center")
    ax.text(x, y - 0.6, "Lectura: un AEROPUERTO es origen de cero o muchas RUTAS; cada RUTA tiene exactamente un origen.",
            fontsize=8, color=TYPEC, va="center", style="italic")


def main():
    fig, ax = plt.subplots(figsize=(21, 10.6))
    ax.set_xlim(-0.6, 30.8)
    ax.set_ylim(-14.6, 1.6)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.text(15.1, 1.15, "Modelo entidad-relación — Sistema de reservas de aerolínea (base transaccional airline)",
            ha="center", fontsize=14, weight="bold", color=INK)

    for (p1, d1, k1), (p2, d2, k2), mids, label, lpos in RELATIONS:
        pts = [p1, *mids, p2]
        ax.plot([p[0] for p in pts], [p[1] for p in pts], color=INK, lw=1.2, zorder=2)
        draw_end(ax, p1, d1, k1)
        draw_end(ax, p2, d2, k2)
        ax.text(*lpos, label, fontsize=8, style="italic", color="#374151", zorder=7,
                bbox=dict(facecolor="white", edgecolor="none", pad=0.6))

    for table, (name, col, top, rows) in ENTITIES.items():
        draw_entity(ax, table, name, col, top, rows)
    draw_legend(ax, 0.0, -9.6)

    out = Path(__file__).with_name("diagrama_er")
    fig.savefig(out.with_suffix(".png"), dpi=200, bbox_inches="tight", facecolor="white")
    fig.savefig(out.with_suffix(".svg"), bbox_inches="tight", facecolor="white")
    print("ok:", out.with_suffix(".png"))


if __name__ == "__main__":
    main()
