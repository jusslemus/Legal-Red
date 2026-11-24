# Prueba local de la API de SAN

La conexión usa `vite.config.js` como intermediario durante `npm run dev`, y solo escucha en 127.0.0.1. No es un backend de producción ni tiene inicio de sesión o autorización por usuario; no exponer este servidor a la red. Para producción se necesita un backend con autenticación y autorización.

1. Copie `.env.example` como `.env.local` y edítelo con la clave y el código de área Legal confirmados por IT. No agregue estos valores al código, repositorio ni chat.
2. Ejecute `npm install` y `npm run dev`. Reinicie Vite después de agregar el archivo de configuración.
3. En el dashboard, seleccione fecha de ingreso desde y hasta (hasta 92 días) y pulse **Consultar SAN**. Solo se consultará el `arecod` configurado. El servidor rechaza resultados sin código de área o que pertenezcan a otro código.

La API no documenta nombres del responsable ni de los países, por ello el primero figura como no disponible y el segundo como código. Se interpreta `FI` como finalizado y los demás estados se muestran con su código. Los indicadores, plazos y estados requieren validación con Legal. El período filtra por fecha de ingreso, por lo que los indicadores no representan el universo completo. La consulta puede producir duplicados por cruces de catálogos de SAN; validar antes de usar como informe definitivo.

`npm run build` genera la vista; `npm run preview` y un sitio estático NO incluyen el intermediario de pruebas y no conectarán con SAN. Los errores de conexión nunca activan datos ficticios.
