"""Dibuja la arquitectura AWS desplegada por infra/*.sh.

    python docs/diagrama_arquitectura.py   ->  docs/diagrama_arquitectura.png
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

INK, MUTED = "#1F2933", "#6B7280"
COLORS = {"compute": "#E8590C", "db": "#1F4E79", "glue": "#6741D9", "storage": "#2B8A3E", "ext": "#495057"}


def box(ax, x, y, w, h, title, lines=(), kind="ext", fill="white"):
    c = COLORS[kind]
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.15",
                                facecolor=fill, edgecolor=c, lw=1.8, zorder=3))
    ax.text(x + w / 2, y + h - 0.32, title, ha="center", va="center", fontsize=10.5, weight="bold",
            color=c, zorder=4)
    for i, line in enumerate(lines):
        ax.text(x + w / 2, y + h - 0.78 - i * 0.36, line, ha="center", va="center", fontsize=8.5,
                color=INK, zorder=4)


def arrow(ax, p1, p2, label="", lpos=None, style="-|>", dashed=False, rad=0.0):
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle=style, mutation_scale=14, lw=1.4, color=INK,
                                 linestyle=(0, (4, 3)) if dashed else "-", zorder=2,
                                 connectionstyle=f"arc3,rad={rad}"))
    if label:
        x, y = lpos or ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
        ax.text(x, y, label, ha="center", va="center", fontsize=8, style="italic", color="#374151", zorder=5,
                bbox=dict(facecolor="white", edgecolor="none", pad=0.8))


def main():
    fig, ax = plt.subplots(figsize=(16, 9.2))
    ax.set_xlim(0, 21)
    ax.set_ylim(0, 12)
    ax.axis("off")
    ax.text(10.5, 11.6, "Arquitectura AWS — Sistema de reservas (Learner Lab, us-east-1)",
            ha="center", fontsize=14, weight="bold", color=INK)

    # Region / VPC
    ax.add_patch(FancyBboxPatch((3.6, 0.4), 17.1, 10.6, boxstyle="round,pad=0.02,rounding_size=0.2",
                                facecolor="#F8FAFC", edgecolor="#94A3B8", lw=1.2, linestyle=(0, (6, 4)), zorder=0))
    ax.text(3.85, 10.7, "AWS · us-east-1 · VPC por defecto (sin NAT Gateway)", fontsize=9, color=MUTED, va="center")

    # Usuarios
    box(ax, 0.2, 7.9, 2.9, 1.6, "Clientes", ["Pasajeros / pruebas", "HTTP"], "ext")
    box(ax, 0.2, 3.2, 2.9, 1.6, "Equipo", ["DBeaver", "(su PC)"], "ext")

    # EC2
    box(ax, 4.3, 7.6, 3.6, 2.2, "EC2 t3.small", ["FastAPI + Uvicorn", "en Docker", "SG airline-api-sg"], "compute",
        "#FFF4E6")

    # Aurora
    ax.add_patch(FancyBboxPatch((9.2, 3.2), 4.6, 6.6, boxstyle="round,pad=0.02,rounding_size=0.15",
                                facecolor="#EEF4FA", edgecolor=COLORS["db"], lw=1.8, zorder=1))
    ax.text(11.5, 9.45, "Aurora PostgreSQL 16", ha="center", fontsize=10.5, weight="bold", color=COLORS["db"])
    ax.text(11.5, 9.05, "1 instancia db.t3.medium · Single-AZ · cifrado", ha="center", fontsize=8, color=INK)
    ax.text(11.5, 8.72, "SG airline-db-sg", ha="center", fontsize=8, color=MUTED)
    box(ax, 9.6, 6.0, 3.8, 2.2, "BD airline (OLTP)", ["10 tablas 3FN", "flights · reservations", "segmentos · pagos"],
        "db")
    box(ax, 9.6, 3.5, 3.8, 2.0, "BD airline_olap (OLAP)", ["fact_route_month", "fact_fare_month"], "db")

    # Glue
    ax.add_patch(FancyBboxPatch((15.0, 3.2), 5.3, 6.6, boxstyle="round,pad=0.02,rounding_size=0.15",
                                facecolor="#F3F0FF", edgecolor=COLORS["glue"], lw=1.8, zorder=1))
    ax.text(17.65, 9.45, "AWS Glue (rol LabRole)", ha="center", fontsize=10.5, weight="bold", color=COLORS["glue"])
    box(ax, 15.4, 7.0, 4.5, 1.9, "2 crawlers JDBC", ["airline-oltp-crawler", "airline-olap-crawler"], "glue")
    box(ax, 15.4, 5.2, 4.5, 1.5, "Job ETL (PySpark)", ["Glue 4.0 · 2 x G.1X"], "glue")
    box(ax, 15.4, 3.5, 4.5, 1.4, "Data Catalog", ["airline_oltp · airline_olap"], "glue")

    # Storage / config
    box(ax, 5.5, 5.0, 2.4, 1.6, "SSM", ["/airline/database_url", "SecureString"], "storage")
    box(ax, 4.3, 0.9, 3.6, 1.9, "S3 airline-<cuenta>", ["código de la API", "script y temp de Glue"], "storage")
    box(ax, 15.4, 0.9, 4.5, 1.6, "Endpoint Gateway S3", ["gratis · Glue llega a S3", "sin salir a internet"], "storage")

    # Flujos
    arrow(ax, (3.1, 8.7), (4.3, 8.7), ":8000", (3.7, 9.05))
    arrow(ax, (7.9, 9.0), (9.6, 7.6), "5432 · SQL", (8.6, 8.95))
    arrow(ax, (3.1, 4.0), (9.6, 4.0), "5432 SSL · solo IP del equipo", (6.4, 4.35))
    arrow(ax, (6.7, 7.6), (6.7, 6.6), "lee la cadena\nde conexión", (8.45, 7.05))
    arrow(ax, (4.75, 7.6), (4.75, 2.8), "descarga\nel código", (5.55, 3.3), dashed=True)
    arrow(ax, (15.4, 6.0), (13.4, 6.9), "lee", (14.4, 6.75))
    arrow(ax, (15.4, 5.6), (13.4, 4.6), "escribe agregados", (14.25, 5.45))
    arrow(ax, (17.65, 7.0), (17.65, 6.7), style="-")
    arrow(ax, (17.65, 5.2), (17.65, 4.9), style="-")
    arrow(ax, (20.1, 7.9), (20.1, 4.2))
    ax.text(20.45, 6.05, "metadatos", rotation=90, ha="center", va="center", fontsize=8, style="italic",
            color="#374151")
    arrow(ax, (17.65, 3.5), (17.65, 2.5), "script", (18.1, 3.0), dashed=True)
    arrow(ax, (15.4, 1.7), (7.9, 1.7), dashed=True)

    out = Path(__file__).with_name("diagrama_arquitectura.png")
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print("ok:", out)


if __name__ == "__main__":
    main()
