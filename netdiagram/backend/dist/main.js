"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const path = require("path");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
                callback(null, true);
            }
            else {
                callback(new Error(`CORS blocked: ${origin}`));
            }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });
    const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
    app.useStaticAssets(frontendDist);
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
    }));
    const port = Number(process.env.PORT) || 3000;
    await app.listen(port);
    const expressApp = app.getHttpAdapter().getInstance();
    const indexFile = path.join(frontendDist, 'index.html');
    expressApp.get('*', (_req, res) => {
        res.sendFile(indexFile);
    });
    console.log(`🚀 NetDiagram running on http://localhost:${port}`);
    console.log(`   API   → http://localhost:${port}/graph`);
    console.log(`   UI    → http://localhost:${port}/`);
}
bootstrap();
//# sourceMappingURL=main.js.map