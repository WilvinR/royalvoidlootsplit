# RoyalBotLootSplit Web Application

Una aplicación web para gestionar actividades y reparto de loot conectada con un bot de Discord/Telegram.

## Características

- 📋 **Gestión de Actividades**: Añade, visualiza y gestiona actividades de raid/grupos
- 🤖 **Integración con Bot**: Conexión directa con el bot para sincronización de datos
- 🎨 **Interfaz Moderna**: Diseño oscuro elegante con animaciones fluidas
- 📱 **Responsive**: Funciona perfectamente en móviles y escritorio
- ⚡ **Tiempo Real**: Actualizaciones instantáneas con el bot

## Archivos del Proyecto

- `index.html` - Estructura principal de la aplicación
- `styles.css` - Estilos y diseño visual
- `script.js` - Lógica de la aplicación e integración con el bot
- `README.md` - Documentación del proyecto

## Configuración del Bot

Para conectar la aplicación con tu bot, edita el archivo `script.js` y actualiza las siguientes constantes:

```javascript
const BOT_CONFIG = {
    webhookUrl: 'YOUR_BOT_WEBHOOK_URL', // Reemplaza con la URL de webhook de tu bot
    apiToken: 'YOUR_BOT_API_TOKEN'      // Reemplaza con el token API de tu bot
};
```

## API del Bot

La aplicación espera que el bot proporcione los siguientes endpoints:

### GET /webhook?action=get_activities
Retorna la lista de actividades actuales.

**Respuesta esperada:**
```json
{
    "success": true,
    "activities": [
        {
            "name": "Nombre de Actividad",
            "date": "Fecha",
            "status": "red|yellow|green"
        }
    ]
}
```

### POST /webhook
Añade una nueva actividad.

**Cuerpo de la solicitud:**
```json
{
    "action": "add_activity",
    "data": {
        "name": "Nombre de Actividad",
        "date": "Fecha",
        "status": "red|yellow|green"
    }
}
```

### PUT /webhook
Actualiza el estado de una actividad.

**Cuerpo de la solicitud:**
```json
{
    "action": "update_status",
    "activityName": "Nombre de Actividad",
    "status": "red|yellow|green"
}
```

### DELETE /webhook
Elimina una actividad.

**Cuerpo de la solicitud:**
```json
{
    "action": "delete_activity",
    "activityName": "Nombre de Actividad"
}
```

## Estados de Actividad

- 🔴 **Rojo (red)**: Actividad pendiente o con problemas
- 🟡 **Amarillo (yellow)**: Actividad en progreso
- 🟢 **Verde (green)**: Actividad completada exitosamente

## Instalación y Uso

1. **Clona o descarga los archivos** del proyecto
2. **Configura el bot** editando `script.js` con tus credenciales
3. **Abre `index.html`** en tu navegador web
4. **Comienza a usar** la aplicación

## Desarrollo

### Tecnologías Utilizadas

- **HTML5** - Estructura semántica
- **CSS3** - Diseño moderno con gradientes y animaciones
- **JavaScript ES6+** - Lógica de la aplicación
- **Font Awesome** - Iconos
- **Google Fonts (Inter)** - Tipografía

### Extensiones Futuras

- [ ] Sistema de login de usuarios
- [ ] Panel de administración avanzado
- [ ] Estadísticas y reportes
- [ ] Integración con múltiples plataformas (Discord, Telegram, Slack)
- [ ] Sistema de notificaciones push
- [ ] Cálculo automático de loot split
- [ ] Historial de actividades

## Contribuir

1. Fork del proyecto
2. Crear una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit de tus cambios (`git commit -am 'Añadir nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear un Pull Request

## Licencia

Este proyecto está bajo la Licencia MIT - mira el archivo LICENSE para detalles.

## Soporte

Si tienes problemas o sugerencias, por favor abre un issue en el repositorio del proyecto.

---

**RoyalBotLootSplit** © 2024 - Todos los derechos reservados
