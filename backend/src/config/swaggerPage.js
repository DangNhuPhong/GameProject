// Pinned browser assets keep the backend free of additional runtime dependencies.
export const swaggerPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OverNauAn API Documentation</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css">
  <style>body{margin:0;background:#fafafa}#load-error{padding:20px;font-family:system-ui}</style>
</head>
<body>
  <div id="load-error" role="status">Loading Swagger UI… If it does not load, check access to unpkg.com.
    <a href="/api-docs.json">Open the OpenAPI JSON</a>.
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    if (window.SwaggerUIBundle) {
      document.getElementById('load-error').hidden = true;
      window.ui = SwaggerUIBundle({
        url: '/api-docs.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        validatorUrl: null,
        persistAuthorization: false,
        displayRequestDuration: true,
        docExpansion: 'list',
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout'
      });
    }
  </script>
</body>
</html>`;
