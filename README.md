# PACPesos - Generación de tokens y QRs (Apps Script)

Instrucciones rápidas para desplegar y usar:

1. Abre Google Apps Script en tu proyecto (o crea uno nuevo).
2. Crea un archivo y pega el contenido de apps-script/PACPesos.gs.
3. Edita la constante ADMIN_KEY en el editor de Apps Script (pon un secreto).
   - Recomendación: usa una cadena fuerte y guárdala fuera del repo.
4. Despliega:
   - "Deploy" -> "New deployment" -> "Web app".
   - Ejecutar la aplicación como: Tu cuenta (Me).
   - Quién tiene acceso: "Anyone" (o "Anyone within <tu dominio>" si usas Workspace).
   - Copia la URL del WebApp y pégala en pages/panel_admin.html (const URL_WEBAPP).
5. Desde el editor de Apps Script puedes:
   - Ejecutar manualmente `generarTokensParaUsuarios()` o `generarQRsParaTodos()` desde el menú Run o usar el menú que crea `onOpen`.
   - O usar el panel_admin.html para ejecutar en lote (se requiere ADMIN_KEY).
6. Para generar tokens/QRs por lote via fetch/curl:
   - Generar tokens:
     curl -X POST -H "Content-Type: application/json" -d '{"accion":"generar_tokens_batch","adminKey":"TU_ADMIN_KEY"}' "TU_WEBAPP_URL"
   - Generar QRs:
     curl -X POST -H "Content-Type: application/json" -d '{"accion":"generar_qrs_batch","adminKey":"TU_ADMIN_KEY"}' "TU_WEBAPP_URL"

Notas de seguridad:
- No subas ADMIN_KEY al repo público.
- Los archivos QR se crean en la carpeta Drive indicada y se configuran como "Anyone with link". Si necesitas control de acceso, no compartas la carpeta públicamente.
- Los tokens se usan en la URL (panel.html?token=...), por eso son secretos; si quieres caducidad/revocación, podemos añadir token_expiry y funciones de revocación.
