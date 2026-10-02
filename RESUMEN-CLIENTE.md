# Resumen para la reunión — VAS Centro de Estética

Documento pensado para repasar con la dueña del centro. Nada técnico de más.

---

## Qué funciona hoy (verificable en producción)

**Sitio:** https://vas-centro.vercel.app

1. **Reservas online.** La clienta elige servicio, fecha, horario y, si quiere, profesional ("cualquiera disponible" o una puntual). Solo se muestran horarios donde **hay una profesional libre con la duración real del servicio** (no se superponen turnos).
2. **Seña obligatoria con foto/PDF.** El turno no se confirma hasta que se sube el comprobante. Tiempo límite: 10 minutos; si pasa, el horario se libera solo.
3. **Panel de la dueña.** Dashboard, servicios, agenda diaria, profesionales, horarios de atención, reglas de precio, caja diaria, clientes, gift cards. Funciona en celular (menú hamburguesa) y computadora.
4. **Micrositio de cada profesional.** Entra con su email y contraseña. Ve solo sus turnos, puede marcarlos completados, y carga su **perfil público**: foto, reseña, fotos de trabajos, y qué servicios brinda.
5. **Perfiles públicos en el landing.** Cada profesional con servicios asignados aparece con su nombre, foto y servicios. Lo ve cualquier visitante.
6. **Precios automáticos.** Fin de semana +20%, happy hour −15% (10–12h), turno del día −20%. Todo configurable desde el panel.
7. **Colores por profesional.** En la agenda de la dueña, cada turno se ve con el color de su profesional.

---

## Qué está listo pero **apagado**, esperando configuración

| Funcionalidad | Qué falta para encenderla | Costo |
|---|---|---|
| **MercadoPago** (pago directo con tarjeta, sin transferencia manual) | Crear cuenta, sacar el Access Token y pegarlo en Vercel | Gratis |
| **Verificación del comprobante con IA** (lee la foto y dice si el monto/fecha/titular coinciden; la dueña da el OK final) | Abrir cuenta gratis en Google AI Studio y pegar la clave en Vercel | Gratis |
| **Turnos en Google Calendar** de cada profesional (se crean solos al confirmar) | Crear proyecto en Google Cloud y pegar 3 claves en Vercel | Gratis |
| **Comisiones** (cuánto le corresponde a cada profesional por turno) | Los porcentajes ya se pueden cargar por servicio; falta **acordar los números con el centro** y se arma la planilla | Gratis |
| **Avisos por WhatsApp automáticos** (confirmación + recordatorio del día anterior) | Hoy salen como link "tocar para enviar"; lo automático requiere Meta Business verificado, plantillas aprobadas y **dominio propio** | Pago (depende del volumen) |
| **Correo del centro con dominio propio** (vascentro.com o similar) para que los mails no salgan del dominio de prueba | Comprar dominio (~USD 10/año) y verificarlo en Resend | USD ~10/año |

---

## Decisiones que tiene que tomar la dueña

1. **¿El dinero de la seña va a una cuenta común del centro o a la de cada profesional?**
   La app ya soporta las dos cosas: hay un interruptor por profesional ("recibe por cuenta propia"). Si elige cuenta común, hay que cargar UNA cuenta (CBU/alias/titular del centro) y listo. Si elige cuenta propia, cada profesional carga la suya desde su micrositio.
2. **¿Qué porcentaje de seña?** Hoy está entre 30 y 40% según el servicio. Se cambia por servicio desde el panel.
3. **¿Horarios reales?** Hoy Lun–Sáb 9:00–19:00. Si hay feriados o días especiales, se cargan en el panel (sección Horarios).
4. **¿Los datos de prueba se borran?** Hay 12 servicios y 5 profesionales de demostración. Con un comando se borra todo el catálogo de prueba sin tocar los turnos reales.

---

## Accesos para la demo

| Quién | Link / email | Clave |
|---|---|---|
| Dueña (admin) | https://vas-centro.vercel.app/admin | `vas@centro.com` / (la que ya usa) |
| Profesional demo | https://vas-centro.vercel.app/employee | `rocio.demo@vas-centro.test` / `DemoVAS2026` |

**Cómo mostrar el flujo completo en 2 minutos:**
1. En el landing → "Reservá ahora" → elegir servicio → elegir hora → confirmar turno → te da el link de pago.
2. Abrir el link de pago → subir cualquier imagen como comprobante.
3. En el panel de la dueña → Agenda/Reservas aparece el turno pendiente → "Confirmar" → el turno queda confirmado.
4. En el micrositio de la profesional → entra → ve el turno del día.

---

## Riesgos que conviene saber

- **El dominio gratis de Vercel** (vas-centro.vercel.app) funciona para siempre, pero para WhatsApp automático y correo profesional hace falta dominio propio.
- **Las fotos/fotos de trabajos** que suben las profesionales son públicas en el landing — hay que pedirles que suban solo material propio o autorizado.
- **Los comprobantes de transferencia** los guarda 1 hora con enlace firmado; después quedan archivados en Storage privado. No se borran solos; si quieren, se programa limpieza a X meses.
