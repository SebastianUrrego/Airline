// Genera el documento simplificado del parcial 1 en Word.
//   node build.js <carpeta airline-system> <salida.docx>
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, ImageRun, PageBreak, TableOfContents, Footer, Header,
  PageNumber, LevelFormat,
} = require("docx");

const [, , ROOT, OUT] = process.argv;
const PAGE_W = 12240, MARGIN = 1134, CONTENT_W = PAGE_W - 2 * MARGIN; // carta, margenes de 2 cm
const BLUE = "1F4E79", GRAY = "5A6570", LIGHT = "F2F5F7";
const FONT = "Calibri";

// ---------- helpers ----------
// Texto con **negrita** y `codigo`
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: tok.slice(1, -1), font: "Consolas", ...base, size: (base.size || 22) - 2 }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const P = (text, opts = {}) => new Paragraph({ children: runs(text), spacing: { after: 120, line: 276 }, alignment: AlignmentType.JUSTIFIED, ...opts });
const H1 = (text, pageBreakBefore = false) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)], pageBreakBefore });
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
const H3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
const bullets = (items) => items.map((t) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: runs(t), spacing: { after: 60 } }));
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
const note = (text) => new Paragraph({
  children: runs(text, { size: 20 }), spacing: { before: 120, after: 160, line: 264 },
  shading: { type: ShadingType.CLEAR, fill: LIGHT, color: "auto" },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color: BLUE, space: 8 } },
  indent: { left: 200, right: 200 }, alignment: AlignmentType.JUSTIFIED,
});
const caption = (text) => new Paragraph({ children: [new TextRun({ text, italics: true, size: 18, color: GRAY })], alignment: AlignmentType.CENTER, spacing: { before: 60, after: 200 } });

function table(headers, rows, widthsPct) {
  const widths = widthsPct.map((p) => Math.round((CONTENT_W * p) / 100));
  widths[widths.length - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: "C9D1D9" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (text, i, header, zebra) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA }, borders,
    shading: header ? { type: ShadingType.CLEAR, fill: BLUE, color: "auto" } : zebra ? { type: ShadingType.CLEAR, fill: "F7F9FB", color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: String(text).split("\n").map((line) => new Paragraph({
      children: runs(line, header ? { bold: true, color: "FFFFFF", size: 18 } : { size: 18 }), spacing: { after: 20 },
    })),
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false, ri % 2 === 1)) })),
    ],
  });
}
const spacer = () => new Paragraph({ children: [], spacing: { after: 80 } });
function image(file, wPx, hPx) {
  return new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 },
    children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width: wPx, height: hPx } })],
  });
}

// ---------- contenido ----------
const body = [];
const add = (...xs) => xs.flat().forEach((x) => body.push(x));

// Portada
add(
  new Paragraph({ spacing: { before: 1800 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Universidad Sergio Arboleda", size: 28, color: GRAY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [new TextRun({ text: "Sistema de Reservas Aéreas", bold: true, size: 52, color: BLUE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BLUE, space: 6 } }, children: [new TextRun({ text: "Requisitos, modelo de datos, arquitectura e implementación", size: 26, color: GRAY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1000 }, children: [new TextRun({ text: "Examen Parcial", bold: true, size: 28 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Big Data and Data Engineering", size: 26 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1000 }, children: [new TextRun({ text: "Autores", bold: true, size: 26 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Julian Cristancho", size: 26 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Andrés Urrego", size: 26 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1800 }, children: [new TextRun({ text: "Bogotá D.C., Colombia · octubre de 2026", size: 24, color: GRAY })] }),
  pageBreak(),
  new Paragraph({ children: [new TextRun({ text: "Contenido", bold: true, size: 32, color: BLUE })], spacing: { after: 200 } }),
  new TableOfContents("Contenido", { hyperlink: true, headingStyleRange: "1-2" }),
);

// 1. Contexto y alcance
add(
  H1("1. Contexto y alcance", true),
  H2("1.1 Descripción general"),
  P("Una aerolínea regional colombiana contrata al equipo para construir desde cero su sistema de reservas. Vende por su sitio web y por agencias de viaje aliadas, y su área comercial necesita analizar la **ocupación por ruta**, los **ingresos por tarifa** y los **patrones de cancelación**. El sistema debe soportar la operación transaccional (búsqueda, reserva, pago y cancelación) y alimentar, sin interferir con ella, una base analítica."),
  H2("1.2 Problema central de diseño"),
  P("El enunciado impone dos condiciones sin cifras: el sistema **no puede vender más sillas de las que tiene el avión** y **el tráfico tiene picos en temporada alta**. Ambas convergen en el mismo punto: controlar la concurrencia sobre un recurso finito y disputado (las sillas de un vuelo) cuando muchos usuarios intentan comprar al mismo tiempo. Cada decisión de este documento se justifica por su relación con ese invariante o con el costo de operarlo."),
  note("**Criterio de simplificación.** Una primera versión del diseño contemplaba 87 requisitos funcionales y 24 entidades (cabinas, cinco clases tarifarias, bloqueos de 15 minutos, tiquetes y cupones, mapa de asientos, agencias con línea de crédito y un registro de eventos). Para el alcance del parcial, el presupuesto del laboratorio (US$50) y la sustentación, el equipo redujo el diseño a lo que el sistema implementa y puede demostrar. La sección 7.5 muestra la correspondencia entre el diseño original y el simplificado."),
  H2("1.3 Dentro del alcance"),
  ...bullets([
    "Búsqueda de vuelos por origen, destino y fecha.",
    "Reserva de vuelos directos y con escalas (hasta cuatro tramos) como una sola transacción.",
    "Precio según clase (ECONOMY o BUSINESS) y anticipación de la compra.",
    "Pago simulado, confirmado en el mismo acto de la reserva.",
    "Consulta y cancelación de reservas, con devolución de las sillas al inventario.",
    "Registro de vuelos por parte del administrador comercial.",
    "Proceso ETL hacia una base analítica y registro de ambas bases en un catálogo de metadatos.",
  ]),
  H2("1.4 Fuera del alcance"),
  table(["ID", "Exclusión", "Justificación"], [
    ["EXC-01", "Programa de viajero frecuente", "No afecta el invariante de inventario."],
    ["EXC-02", "Selección de asiento y check-in", "El inventario se controla por cupo del vuelo, no por asiento físico; la silla se asignaría en el check-in."],
    ["EXC-03", "API B2B con comisiones y línea de crédito", "Las agencias usan la misma API; la liquidación con agencias es un subsistema contable aparte."],
    ["EXC-04", "Pasarela de pago real y pago en dos fases", "Se simula; el sistema nunca recibe datos de tarjeta."],
    ["EXC-05", "Cambio de fecha y matriz de penalidades", "Un cambio se resuelve como cancelación más nueva reserva; la cancelación devuelve el valor completo."],
    ["EXC-06", "Equipaje, mascotas, asistencia especial y tripulación", "Dominios con reglas propias, ortogonales al problema de concurrencia."],
    ["EXC-07", "Varios pasajeros en una misma reserva", "Una reserva corresponde a un pasajero; un grupo hace varias reservas."],
  ], [12, 34, 54]),
);

// 2. Actores
add(
  H1("2. Actores del sistema"),
  P("Todos los actores usan el mismo backend. Solo el proceso ETL y el equipo técnico acceden directamente a las bases de datos."),
  table(["ID", "Actor", "Interfaz", "Responsabilidad"], [
    ["ACT-01", "Pasajero", "API REST (sitio web)", "Buscar vuelos, reservar, consultar y cancelar."],
    ["ACT-02", "Agencia aliada", "La misma API REST", "Reservar en nombre de sus clientes con el mismo inventario y las mismas reglas."],
    ["ACT-03", "Administrador comercial", "Endpoint de administración y DBeaver", "Registrar vuelos, rutas, aviones y reglas de tarifa."],
    ["ACT-04", "Analista de datos", "Base analítica y Glue Data Catalog", "Consultar ocupación, ingresos y cancelaciones."],
    ["ACT-05", "Proceso ETL (AWS Glue)", "Job de datos", "Extraer de la base transaccional, agregar y cargar en la analítica."],
    ["ACT-06", "Pasarela de pago", "Simulada dentro de la API", "Aprobar el pago y devolver una referencia de transacción."],
  ], [11, 20, 25, 44]),
);

// 3. Supuestos
add(
  H1("3. Supuestos"),
  P("Un supuesto no declarado es una decisión de arquitectura oculta. Estos son los que adopta el equipo:"),
  table(["ID", "Supuesto", "Impacto en el diseño"], [
    ["SUP-01", "La aerolínea opera rutas nacionales y cobra en pesos colombianos. Los montos se guardan como enteros en centavos.", "Columnas `BIGINT`; sin errores de redondeo de punto flotante."],
    ["SUP-02", "Se distingue el **vuelo programado** (AV101 BOG-MDE todos los días a las 06:00) del **vuelo con fecha** (AV101 del 10 de marzo).", "El inventario y el precio cuelgan del vuelo con fecha; el horario, del programado."],
    ["SUP-03", "La unidad disputada es un **cupo** del vuelo, no un asiento físico.", "Un solo contador por vuelo: una sola fila que bloquear."],
    ["SUP-04", "**No se autoriza sobreventa.**", "`sillas_confirmadas ≤ capacidad` se verifica de forma atómica en cada reserva."],
    ["SUP-05", "Una reserva puede tener hasta cuatro tramos y se confirma completa o no se confirma.", "Todos los tramos se reservan en una única transacción."],
    ["SUP-06", "Hay dos clases, ECONOMY y BUSINESS, y el precio sube a medida que se acerca el vuelo.", "Tabla `fare_rules`: multiplicador por clase y días de anticipación (0, 7 y 21 días)."],
    ["SUP-07", "No se reserva sin pagar: el pago (simulado) se aprueba en el mismo acto.", "No hacen falta bloqueos temporales ni expiraciones."],
    ["SUP-08", "Cancelar devuelve las sillas y el valor completo.", "Sin matriz de penalidades en esta versión."],
    ["SUP-09", "La analítica tolera datos de hasta un día de antigüedad.", "ETL por lotes bajo demanda, no en tiempo real."],
    ["SUP-10", "Volumetría de referencia: 8 rutas, un vuelo diario de 150 sillas por ruta y unas 160.000 reservas por semestre. En los picos, 20 clientes buscando a la vez y hasta 50 compitiendo por la última silla.", "Base para las métricas de los RNF y para los datos de prueba."],
  ], [11, 52, 37]),
);

// 4. Reglas de negocio
add(
  H1("4. Reglas de negocio"),
  table(["ID", "Regla", "Deriva de"], [
    ["RN-01", "En ningún vuelo las sillas confirmadas pueden superar la capacidad (`0 ≤ seats_available ≤ capacity`).", "SUP-03, SUP-04"],
    ["RN-02", "Una reserva con escalas se confirma completa o no se confirma; no quedan tramos huérfanos.", "SUP-05"],
    ["RN-03", "Los tramos deben encadenar: el destino de cada tramo es el origen del siguiente y las fechas no retroceden.", "SUP-05"],
    ["RN-04", "Los vuelos de una reserva se bloquean siempre en orden ascendente de identificador, para evitar interbloqueos.", "SUP-05"],
    ["RN-05", "Se aplica la regla de tarifa de la clase con el mayor `min_days_before` que no supere los días que faltan para el vuelo.", "SUP-06"],
    ["RN-06", "No se puede reservar un vuelo cuya fecha ya pasó.", "SUP-02"],
    ["RN-07", "Cancelar devuelve una silla por cada tramo y marca el pago como reembolsado; una reserva ya cancelada no se puede volver a cancelar.", "SUP-08"],
  ], [11, 69, 20]),
);

// 5. Requisitos funcionales
add(
  H1("5. Requisitos funcionales"),
  P("Prioridad en escala MoSCoW: **M** (*Must*) es indispensable para cumplir el escenario y el invariante; **S** (*Should*) es necesario para operar pero no para demostrar el núcleo. La última columna indica dónde se implementa cada requisito."),
  table(["ID", "Descripción", "Actor", "Pri.", "Implementación"], [
    ["RF-01", "Buscar vuelos por origen, destino y fecha, devolviendo solo los que tienen sillas disponibles.", "ACT-01, 02", "M", "`GET /flights/search`"],
    ["RF-02", "Crear una reserva de vuelo directo, confirmada y con código de reserva.", "ACT-01, 02", "M", "`POST /reservations`"],
    ["RF-03", "Crear una reserva con escalas (hasta 3 conexiones) en una sola transacción, validando que los tramos encadenen.", "ACT-01, 02", "M", "`POST /reservations` con `connection_flight_ids`"],
    ["RF-04", "Calcular el precio de cada tramo según la clase y la anticipación de la compra.", "Sistema", "M", "Tabla `fare_rules`"],
    ["RF-05", "Rechazar con código 409 la reserva cuando algún tramo no tiene sillas, sin dejar sillas consumidas.", "Sistema", "M", "`UPDATE` condicional"],
    ["RF-06", "Rechazar reservas de vuelos que ya salieron.", "Sistema", "S", "`POST /reservations`"],
    ["RF-07", "Consultar una reserva por su código.", "ACT-01, 02", "M", "`GET /reservations/{id}`"],
    ["RF-08", "Cancelar una reserva, devolver las sillas de todos sus tramos y marcar el pago como reembolsado.", "ACT-01, 02", "M", "`POST /reservations/{id}/cancel`"],
    ["RF-09", "Registrar el pago de cada reserva con la referencia de la pasarela, sin almacenar datos de tarjeta.", "Sistema", "M", "Tabla `payments`"],
    ["RF-10", "Registrar vuelos con fecha, capacidad y tarifa base.", "ACT-03", "M", "`POST /admin/flights`"],
    ["RF-11", "Mantener el catálogo de aeropuertos, rutas, aviones y vuelos programados.", "ACT-03", "S", "Esquema y DBeaver"],
    ["RF-12", "Exponer el estado de la API para monitoreo.", "Sistema", "S", "`GET /health`"],
    ["RF-13", "Cargar en la base analítica la ocupación, los ingresos y las cancelaciones por ruta y mes.", "ACT-05", "M", "Job Glue → `fact_route_month`"],
    ["RF-14", "Cargar en la base analítica los ingresos y la tasa de cancelación por clase y mes.", "ACT-05", "M", "Job Glue → `fact_fare_month`"],
    ["RF-15", "Registrar las tablas de ambas bases como metadatos consultables en el catálogo de datos.", "ACT-04, 05", "M", "Crawlers de Glue"],
    ["RF-16", "Ejecutar el ETL bajo demanda sin bloquear las escrituras del sistema de reservas.", "ACT-05", "M", "Job Glue"],
  ], [9, 45, 13, 6, 27]),
  spacer(),
  H2("5.1 Respuesta a las preguntas guía"),
  table(["Pregunta del enunciado", "Decisión del equipo", "Materializa"], [
    ["¿Quiénes son los actores y comparten el sistema?", "Seis actores sobre un único backend. Pasajeros y agencias usan la misma API: un solo inventario y un solo invariante.", "RF-01, RF-02"],
    ["¿Cómo se maneja una reserva con escalas?", "Una sola reserva con varios tramos (`reservation_segments`), confirmada en una transacción atómica. No son reservas encadenadas.", "RF-03, RF-05"],
    ["¿Se puede reservar sin pagar?", "No. El pago se aprueba en el mismo acto; así no hay inventario comprometido sin pago.", "RF-09"],
    ["¿Qué pasa si cancela o cambia la fecha?", "Cancelar devuelve las sillas y el pago. Cambiar de fecha es cancelar y reservar de nuevo.", "RF-08"],
    ["¿Las agencias tienen un flujo distinto?", "No en esta versión: compiten por el mismo inventario con las mismas reglas. Comisiones y crédito quedan fuera del alcance (EXC-03).", "RF-02"],
  ], [28, 55, 17]),
);

// 6. RNF
add(
  H1("6. Requisitos no funcionales"),
  P("Cada requisito tiene una métrica verificable, el riesgo de negocio que lo justifica y su estado en la implementación."),
  table(["ID", "Categoría", "Requisito y métrica", "Riesgo de negocio", "Verificación y estado"], [
    ["RNF-01", "Rendimiento", "Búsqueda con p95 ≤ 1 s bajo 20 clientes concurrentes.", "Una búsqueda lenta hace que el cliente abandone antes de comprar.", "Índice `(route_code, flight_date)`. Se medirá con el harness sobre la EC2."],
    ["RNF-02", "Rendimiento", "Creación de reserva con p95 ≤ 1,5 s.", "Una reserva lenta alarga la espera de quienes compiten por el mismo vuelo.", "Prueba de concurrencia: 50 reservas resueltas en menos de 2 s por ronda."],
    ["RNF-03", "Concurrencia", "Con 50 reservas simultáneas por la última silla: exactamente 1 respuesta 201, 49 respuestas 409 y ninguna 5xx. Con K sillas, exactamente K respuestas 201.", "Cada sobreventa es un pasajero sin silla en el aeropuerto.", "**Verificado**: prueba automatizada de 5 rondas (sección 10.4)."],
    ["RNF-04", "Concurrencia", "Una reserva con escalas que falla en un tramo no consume sillas en ningún otro.", "Una silla huérfana bloquea inventario sin ingreso.", "**Verificado**: prueba `test_multi_leg_itinerary_is_all_or_nothing`."],
    ["RNF-05", "Disponibilidad", "99 % mensual en el laboratorio (una instancia, una zona). En producción, 99,9 % con una réplica de Aurora en otra zona.", "La caída en temporada alta es venta perdida, pero una réplica duplica el costo de la base.", "Decisión de costo documentada en la sección 11.4."],
    ["RNF-06", "Seguridad", "Cero datos de tarjeta en el esquema. Contraseña de la base cifrada en SSM. Almacenamiento cifrado. Puerto 5432 abierto solo a la IP del equipo. Conexiones de clientes con SSL.", "Guardar tarjetas amplía el alcance de PCI-DSS; una base expuesta es una filtración.", "Inspección del DDL y de la configuración (scripts de `infra/`)."],
    ["RNF-07", "Escalabilidad", "Con 20 rutas nuevas, la búsqueda mantiene p95 ≤ 1 s sin cambiar la arquitectura.", "Si el crecimiento degrada la experiencia, las rutas nuevas nacen con mala conversión.", "Primer cuello de botella: la instancia única db.t3.medium (CPU con créditos). La contención no crece porque es por vuelo."],
    ["RNF-08", "Auditabilidad", "Toda reserva conserva fechas de creación y modificación, la regla tarifaria aplicada, el precio congelado de cada tramo y su pago.", "Sin esos datos no se puede resolver un reclamo de cobro.", "Consulta en DBeaver. El historial completo de cambios queda como extensión."],
    ["RNF-09", "Aislamiento analítico", "El ETL no bloquea escrituras y nunca se consulta la base transaccional para analítica.", "Una consulta analítica pesada en un pico de ventas compite con las reservas.", "El ETL usa lecturas simples en `READ COMMITTED` y escribe en otra base."],
  ], [9, 12, 29, 22, 28]),
);

// 7. Modelo ER
add(
  H1("7. Modelo entidad-relación"),
  H2("7.1 Decisiones de modelado"),
  table(["Pregunta", "Decisión", "Justificación"], [
    ["¿Cómo se modela un itinerario con escalas?", "La reserva es el itinerario completo y tiene uno o más tramos (`reservation_segments`); cada tramo apunta a un vuelo.", "Una sola transacción reserva todos los tramos: todo o nada."],
    ["¿La silla se asigna al comprar o en el check-in?", "En el check-in (fuera del alcance). Al comprar solo se descuenta un cupo.", "Asignar asientos al comprar exigiría bloquear un mapa por vuelo y complicaría la concurrencia."],
    ["¿Cómo se representa un vuelo que se repite?", "`scheduled_flights` (programado) y `flights` (vuelo con fecha, con su inventario y precio).", "El inventario y el precio cambian por fecha; el horario no."],
    ["¿Dónde vive el control de inventario?", "En `flights.seats_available`, con `CHECK (seats_available BETWEEN 0 AND capacity)`.", "Un único punto de contención por vuelo, verificado por el motor."],
    ["¿Qué nivel de normalización?", "Tercera forma normal en la base transaccional; tablas agregadas y desnormalizadas en la analítica.", "En la transaccional se evitan anomalías bajo escritura concurrente; la analítica se optimiza para lectura."],
  ], [24, 42, 34]),
  H2("7.2 Diagrama entidad-relación"),
  image(path.join(ROOT, "docs", "diagrama_er.png"), 650, 339),
  caption("Figura 1. Modelo entidad-relación de la base transaccional (notación Crow's Foot). Sobre cada entidad, en gris, el nombre de su tabla en la base de datos."),
  H2("7.3 Diccionario de datos"),
  P("El diagrama usa nombres en español. En la base de datos, las tablas y columnas conservan nombres en inglés, que son los que aparecen en DBeaver y en el código."),
  table(["Entidad (tabla)", "Columnas principales", "Reglas y restricciones"], [
    ["**Aeropuertos**\n`airports`", "code (PK), city", "Código IATA de 3 letras."],
    ["**Rutas**\n`routes`", "route_code (PK), origin, destination", "FK a `airports`; `origin <> destination`."],
    ["**Aviones**\n`aircraft`", "aircraft_id (PK), model, capacity", "Matrícula del avión; capacidad > 0."],
    ["**Vuelos programados**\n`scheduled_flights`", "flight_number (PK), route_code, departure_time, days_of_week, aircraft_id", "Vuelo programado recurrente."],
    ["**Vuelos**\n`flights`", "flight_id (PK), flight_number, route_code, aircraft_id, flight_date, capacity, seats_available, price_cents", "**Inventario.** `0 ≤ seats_available ≤ capacity`; `UNIQUE(flight_number, flight_date)`; índice `(route_code, flight_date)`."],
    ["**Pasajeros**\n`passengers`", "passenger_id (PK), full_name, document_id, email", "Datos personales (Ley 1581 de 2012)."],
    ["**Reglas de tarifa**\n`fare_rules`", "fare_rule_id (PK), fare_class, min_days_before, multiplier", "6 reglas: ECONOMY y BUSINESS × 0, 7 y 21 días."],
    ["**Reservas**\n`reservations`", "reservation_id (PK), passenger_id, fare_rule_id, status, total_price_cents, created_at, updated_at", "`status` ∈ {CONFIRMED, CANCELLED}."],
    ["**Tramos de reserva**\n`reservation_segments`", "(reservation_id, segment_no) PK, flight_id, price_cents", "Cada tramo ocupa una silla; precio congelado."],
    ["**Pagos**\n`payments`", "payment_id (PK), reservation_id (UQ), amount_cents, provider, provider_ref, status", "Sin datos de tarjeta; `status` ∈ {APPROVED, REFUNDED}."],
  ], [20, 45, 35]),
  H2("7.4 Modelo analítico"),
  table(["Tabla", "Grano", "Columnas"], [
    ["`fact_route_month`", "Ruta × mes", "seats_capacity, seats_sold, occupancy, revenue_cents, bookings, cancellations, etl_loaded_at"],
    ["`fact_fare_month`", "Clase × mes", "revenue_cents, bookings, cancellations, cancel_rate, etl_loaded_at"],
  ], [24, 16, 60]),
  P("Las dos tablas responden directamente las tres preguntas del área comercial: ocupación por ruta, ingresos por tarifa y patrones de cancelación. Se cuenta por tramo, porque un itinerario con escala ocupa una silla en cada vuelo."),
  H2("7.5 Simplificación respecto al diseño inicial"),
  table(["Diseño inicial", "Versión simplificada", "Motivo"], [
    ["Dos cabinas y cinco clases (XS, S, M, L, PR) con cupo por clase", "Dos clases (ECONOMY y BUSINESS) que comparten el cupo del vuelo", "Un solo contador por vuelo mantiene el invariante con una fila."],
    ["Ventanas de anticipación por clase", "Multiplicador por anticipación en `fare_rules`", "Conserva la regla del enunciado con una tabla parametrizable."],
    ["Bloqueo temporal de 15 minutos y barrido de expirados", "Pago aprobado en el mismo acto", "Elimina expiraciones, barridos y conciliaciones."],
    ["Tiquetes y cupones (pasajero × tramo)", "Un pasajero por reserva y un registro por tramo", "Cubre las escalas sin la doble descomposición."],
    ["Mapa de asientos y check-in", "Fuera del alcance (EXC-02)", "No afecta el control de cupos."],
    ["Agencias con OAuth, crédito y comisiones", "Agencias en la misma API (EXC-03)", "Mismo inventario y mismas reglas."],
    ["Registro de eventos de solo anexado", "Fechas de creación y modificación y estado del pago", "Suficiente para el alcance; queda como extensión."],
  ], [33, 33, 34]),
);

// 8. Backend
add(
  H1("8. Arquitectura de backend"),
  H2("8.1 Monolito con un núcleo transaccional"),
  P("Se adopta **un único servicio** (FastAPI) sobre **una única base transaccional** (Aurora PostgreSQL). El criterio es que una frontera de servicio no puede atravesar una transacción: una reserva con escalas debe descontar sillas de varios vuelos y crear la reserva, sus tramos y su pago de forma atómica (RNF-03, RNF-04). Repartir esas operaciones entre servicios exigiría sagas con compensación, que solo dan atomicidad eventual, y durante esa ventana el inventario quedaría inconsistente."),
  H2("8.2 Control de concurrencia"),
  P("Cada tramo se reserva con un `UPDATE` condicional y atómico dentro de la transacción:"),
  new Paragraph({ children: [new TextRun({ text: "UPDATE flights SET seats_available = seats_available - 1 WHERE flight_id = $1 AND seats_available > 0 RETURNING price_cents;", font: "Consolas", size: 18 })], shading: { type: ShadingType.CLEAR, fill: LIGHT, color: "auto" }, spacing: { before: 60, after: 160 }, indent: { left: 200, right: 200 } }),
  P("PostgreSQL bloquea la fila del vuelo hasta el final de la transacción. Las demás peticiones esperan y, al liberarse el bloqueo, vuelven a evaluar `seats_available > 0` con el valor actualizado. Si no se actualiza ninguna fila, la respuesta es **409**, un rechazo inmediato y definitivo. Los vuelos de un itinerario se bloquean en orden ascendente (RN-04) y, si un tramo falla, el `ROLLBACK` devuelve las sillas ya tomadas. El `CHECK` de la tabla es una segunda barrera en el propio motor."),
  table(["Alternativa", "Comportamiento", "Decisión"], [
    ["Bloqueo optimista con reintentos", "Los conflictos se concentran en las últimas sillas, justo donde más importa; los reintentos alargan la respuesta.", "Descartada"],
    ["Cola que serializa por vuelo", "Un itinerario con escalas necesitaría coordinar varias colas; la respuesta pasaría a ser asíncrona.", "Descartada"],
    ["`UPDATE` condicional (bloqueo pesimista implícito por fila)", "Un punto de serialización por vuelo, atomicidad nativa y rechazo síncrono.", "**Adoptada**"],
  ], [30, 52, 18]),
  H2("8.3 Pago, agencias y relación con el pipeline"),
  ...bullets([
    "**Pago:** se delega a una pasarela (simulada en el prototipo). El sistema guarda solo el monto, el proveedor, la referencia y el estado; nunca datos de tarjeta (RNF-06).",
    "**Agencias:** consumen la misma API y compiten por el mismo inventario. Una API B2B separada, con autenticación propia, comisiones y crédito, queda como evolución (EXC-03).",
    "**Pipeline analítico:** la API nunca consulta la base analítica y el área comercial nunca consulta la transaccional. AWS Glue extrae, agrega y carga entre ambas (RNF-09).",
  ]),
);

// 9. Frontend
add(
  H1("9. Arquitectura de frontend"),
  P("El frontend se construye en el parcial 2. Estas son las decisiones de diseño que lo condicionan:"),
  ...bullets([
    "**Aplicación de página única (SPA)** que consume la API REST. La búsqueda es una sola llamada con índice (RNF-01), y el flujo de reserva es corto y con estado, así que no justifica renderizado en servidor.",
    "**Silla no disponible:** como no se elige asiento al comprar, no se necesita un canal en tiempo real. Si otra persona tomó la última silla, la API responde **409** de inmediato y la interfaz lo muestra y refresca la búsqueda.",
    "**Agencias:** usan la misma interfaz. Una consola separada solo se justificaría con comisiones y crédito (EXC-03).",
    "**Moneda e idioma:** todo en pesos colombianos y en español. La interfaz no convierte montos: muestra los que calcula el servidor.",
  ]),
);

// 10. Implementación backend
add(
  H1("10. Primera implementación del backend"),
  H2("10.1 Estructura del repositorio"),
  table(["Ruta", "Contenido"], [
    ["`backend/app/main.py`", "Endpoints de la API (FastAPI) y lógica de reserva con control de concurrencia."],
    ["`backend/app/db.py`", "Pool de conexiones a Aurora PostgreSQL."],
    ["`backend/schema.sql`", "Modelo entidad-relación implementado (10 tablas)."],
    ["`backend/Dockerfile`", "Imagen de la API (Python 3.12, Uvicorn con 2 workers)."],
    ["`tests/test_api.py`", "Pruebas funcionales y prueba de concurrencia."],
    ["`infra/*.sh`", "Scripts de CloudShell que crean Aurora, la EC2 y Glue."],
    ["`infra/glue/etl_oltp_to_olap.py`", "Job ETL de Glue."],
    ["`docs/`", "Arquitectura, diccionario de datos y diagramas."],
  ], [32, 68]),
  H2("10.2 Endpoints"),
  table(["Método y ruta", "Qué hace", "Respuestas"], [
    ["`GET /flights/search`", "Vuelos con sillas por origen, destino y fecha.", "200 · 422"],
    ["`POST /reservations`", "Reserva directa o con escalas (`connection_flight_ids`).", "201 · 404 · 409 · 422"],
    ["`GET /reservations/{id}`", "Consulta una reserva.", "200 · 404"],
    ["`POST /reservations/{id}/cancel`", "Cancela y devuelve las sillas.", "200 · 404 · 409"],
    ["`POST /admin/flights`", "Registra un vuelo con fecha.", "201 · 409"],
    ["`GET /health`", "Estado de la API.", "200"],
  ], [32, 46, 22]),
  H2("10.3 Guía de ejecución"),
  ...bullets([
    "En AWS: subir `airline-system.zip` a CloudShell y ejecutar en orden `1_red_y_aurora.sh`, `2_esquemas_y_datos.sh`, `3_ec2_api.sh` y `4_glue.sh`. Al terminar cada sesión: `apagar.sh`.",
    "Localmente: copiar `.env.example` a `.env` con la cadena de conexión y ejecutar `docker compose up --build api`.",
    "Pruebas: `pytest -v -s tests/` con la variable `BASE_URL` apuntando a la API.",
  ]),
  H2("10.4 Evidencia de la prueba de concurrencia"),
  P("La prueba crea un vuelo y libera 50 reservas simultáneas mediante una barrera de hilos. Se repite 5 rondas con 1 silla y 5 rondas con 5 sillas. Resultado de la ejecución del 19 de octubre de 2026 sobre PostgreSQL 16, con la API en 2 workers de Uvicorn:"),
  table(["Escenario", "Ronda 1", "Ronda 2", "Ronda 3", "Ronda 4", "Ronda 5"], [
    ["1 silla, 50 peticiones", "201=1 · 409=49", "201=1 · 409=49", "201=1 · 409=49", "201=1 · 409=49", "201=1 · 409=49"],
    ["5 sillas, 50 peticiones", "201=5 · 409=45", "201=5 · 409=45", "201=5 · 409=45", "201=5 · 409=45", "201=5 · 409=45"],
  ], [20, 16, 16, 16, 16, 16]),
  P("En ninguna ronda hubo respuestas 5xx, y al final cada vuelo quedó con `seats_available = 0`. La suite completa (11 pruebas, incluida la del itinerario con escala que falla en el segundo tramo) pasó. Con los datos de ejemplo (1.448 vuelos y 164.222 reservas) no hay ningún vuelo cuyas sillas confirmadas difieran de su inventario. **Pendiente:** repetir la prueba contra la API en la EC2 con Aurora y adjuntar `evidencia_pruebas.txt`."),
  H2("10.5 Desviaciones respecto al diseño"),
  table(["Desviación", "Motivo", "Documento actualizado"], [
    ["Se pasó del modelo de 24 entidades al de 10 tablas.", "Alcance del parcial y presupuesto del laboratorio (sección 7.5).", "Secciones 5, 6 y 7"],
    ["`flight_number` y `aircraft_id` son opcionales en `flights`.", "Permite vuelos chárter o de prueba creados por `/admin/flights` sin vuelo programado.", "Diccionario de datos"],
    ["Pago simulado con proveedor `SIMULADO`.", "No hay pasarela real en el laboratorio; la propiedad verificable es que no se guardan tarjetas.", "Sección 8.3"],
  ], [36, 44, 20]),
);

// 11. AWS
add(
  H1("11. Implementación en AWS: ETL, catálogo y costos"),
  H2("11.1 Arquitectura desplegada"),
  image(path.join(ROOT, "docs", "diagrama_arquitectura.png"), 650, 376),
  caption("Figura 2. Arquitectura desplegada en AWS Academy Learner Lab."),
  H2("11.2 Proceso ETL"),
  ...bullets([
    "**Qué se copia:** no se copian las tablas tal cual. Se transforman y agregan `flights`, `reservations`, `reservation_segments` y `fare_rules` en dos tablas de hechos (sección 7.4).",
    "**Esquema analítico:** distinto del transaccional, desnormalizado y sin datos personales: no se copian nombres, documentos, correos ni referencias de pago.",
    "**Servicio:** job de **AWS Glue** (PySpark, Glue 4.0, 2 workers G.1X) con el rol LabRole. Las alternativas consideradas fueron Lambda con SQL (límite de 15 minutos y conexión manual a la VPC) y `postgres_fdw` dentro de Aurora (acopla las dos bases y no deja metadatos en el catálogo).",
    "**Conexión al catálogo:** dos conexiones JDBC de Glue, en la misma subred y con el security group de Aurora (con una regla que se referencia a sí mismo, como exige Glue), más un endpoint Gateway de S3 para no necesitar NAT Gateway. Dos crawlers registran las tablas en las bases `airline_oltp` y `airline_olap` del Data Catalog.",
    "**Frecuencia:** bajo demanda en el laboratorio, porque un disparador programado fallaría con el cluster detenido. En producción sería diario de madrugada. La analítica tolera un día de antigüedad (SUP-09), y correrlo cada hora multiplicaría el costo del job por 24 sin un beneficio para el tablero gerencial.",
  ]),
  H2("11.3 Justificación de servicios"),
  table(["Servicio", "Alternativa considerada", "Requisito", "Pilar Well-Architected"], [
    ["Aurora PostgreSQL (1 instancia db.t3.medium)", "RDS PostgreSQL; DynamoDB", "RF-02, RF-05, RNF-03", "**Confiabilidad**: bloqueo por fila y transacciones ACID. **Costos**: una sola instancia, sin réplica."],
    ["Segunda base `airline_olap` en el mismo cluster", "Otro cluster", "RF-13, RF-14, RNF-09", "**Costos**: un segundo cluster duplicaría el costo. **Eficiencia**: modelo agregado para lectura."],
    ["EC2 t3.small + Docker", "Elastic Beanstalk, ECS Fargate", "RF-01, RNF-01", "**Costos**: la opción más barata. **Excelencia operativa**: un comando despliega la API."],
    ["AWS Glue (job + crawlers + Data Catalog)", "Lambda, `postgres_fdw`", "RF-13 a RF-16", "**Excelencia operativa**: servicio administrado. **Costos**: se paga por segundo de ejecución."],
    ["S3 + endpoint Gateway", "NAT Gateway (~US$33 al mes)", "RF-16", "**Costos**: el endpoint es gratis. **Seguridad**: el tráfico no sale a internet."],
    ["SSM Parameter Store (SecureString)", "Variables en el código; Secrets Manager", "RNF-06", "**Seguridad**: credenciales cifradas fuera del código. **Costos**: nivel estándar gratuito."],
    ["Security groups", "Base pública sin restricción", "RNF-06", "**Seguridad**: 5432 solo desde la EC2, Glue y la IP del equipo."],
  ], [24, 20, 18, 38]),
  H2("11.4 Proyección de costos"),
  P("Precios públicos aproximados en us-east-1. La columna de laboratorio supone unas 60 horas encendido al mes; el resto del tiempo el cluster y la EC2 se detienen con `apagar.sh`."),
  table(["Servicio", "Supuesto", "24/7 al mes", "Laboratorio (~60 h)"], [
    ["Aurora db.t3.medium", "US$0,082 por hora", "US$59,9", "US$4,9"],
    ["Almacenamiento + I/O de Aurora", "<5 GB, <1 M de operaciones de I/O", "US$0,7", "US$0,7"],
    ["EC2 t3.small + 8 GB gp3", "US$0,0208 por hora", "US$15,8", "US$1,9"],
    ["Job de Glue", "2 DPU × 2 min × 30 ejecuciones a US$0,44/DPU-h", "US$0,9", "US$0,2"],
    ["Crawlers de Glue", "~4 ejecuciones, mínimo 10 min", "US$0,3", "US$0,3"],
    ["Data Catalog, S3, endpoint, SSM", "Capas gratuitas, <1 GB", "US$0,1", "US$0,1"],
    ["**Total**", "", "**~US$78**", "**~US$8**"],
  ], [30, 38, 16, 16]),
  P("**Escenario ×10.** Si el volumen de datos o la frecuencia se multiplican por 10, el almacenamiento y el I/O crecen linealmente pero siguen siendo marginales, y el job de Glue sube a unos US$9 al mes. El cambio relevante es la instancia: db.t3.medium se queda corta en memoria y CPU, y habría que pasar a db.r6g.large (~US$190 al mes) o mover la analítica a S3 + Athena, que es lo que plantea el parcial 2."),
  note("**Pilares de costos y sostenibilidad.** Se paga solo por lo que se usa (Glue por segundo, recursos apagados fuera de las sesiones), no hay recursos ociosos (sin NAT Gateway ni réplica) y cada instancia tiene el tamaño de la carga real. Prendido 24/7, Aurora consumiría el presupuesto de US$50 en unas tres semanas: apagarlo es parte de la arquitectura, no un descuido."),
);

// Anexo
add(
  H1("Anexo A. Bitácora de prompts", true),
  P("Principales instrucciones dadas al asistente de IA y cómo las corrigió el equipo."),
  table(["#", "Prompt (resumen)", "Salida del asistente", "Corrección del equipo"], [
    ["1", "Explicar de qué tratan los parciales 1 y 2.", "Resumen de requisitos, harness y relación entre parciales.", "Se usó el parcial 1 como base del parcial 2."],
    ["2", "Hacer el parcial 1 desde cero.", "Backend FastAPI con PostgreSQL en Docker sobre la EC2.", "El profesor exige Aurora y DBeaver: se cambió la base a Aurora."],
    ["3", "Planear la arquitectura y crearla en la cuenta de AWS.", "Arquitectura con Aurora, EC2 y Glue, más scripts de CloudShell por etapas.", "Se aprobó; se pidió mantener todo simple por ser un laboratorio."],
    ["4", "Hacer el diagrama de la base de datos.", "Modelo ampliado de 10 tablas y diagrama Crow's Foot.", "Se eligió el modelo ampliado para cubrir escalas y vuelos recurrentes."],
    ["5", "Aplicar los requisitos funcionales del documento inicial.", "Propuesta para implementar los 87 RF.", "Se decidió simplificar el documento y alinearlo con el código."],
    ["6", "Simplificar el documento.", "Esta versión del documento.", "Revisión final del equipo."],
  ], [5, 30, 33, 32]),
);

// ---------- documento ----------
const doc = new Document({
  creator: "Julian Cristancho, Andrés Urrego",
  title: "Sistema de Reservas Aéreas - Parcial Big Data",
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, color: BLUE, font: FONT }, paragraph: { spacing: { before: 360, after: 140 }, outlineLevel: 0, keepNext: true, keepLines: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 25, bold: true, color: BLUE, font: FONT }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1, keepNext: true, keepLines: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, color: GRAY, font: FONT }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2, keepNext: true, keepLines: true } },
    ],
  },
  numbering: {
    config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }],
  },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: 15840 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } }, titlePage: true },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Sistema de Reservas Aéreas · Parcial Big Data and Data Engineering", size: 16, color: GRAY })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: GRAY })] })] }) },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("ok:", OUT, buf.length, "bytes"); });
