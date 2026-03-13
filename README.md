<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ yarn install
```

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
# vyro-api

## Exams review endpoint

`GET /exams/:examId/review`

Requiere JWT. Devuelve detalle de revisión solo cuando el examen existe, el usuario tiene acceso (propietario o `ADMIN`) y el examen está `FINISHED`.

Respuesta:

```json
{
  "id": "exam-123",
  "status": "FINISHED",
  "questionCount": 10,
  "correctCount": 4,
  "wrongCount": 6,
  "scorePercent": 40,
  "isPassed": false,
  "examQuestions": [
    {
      "id": "eq-1",
      "order": 1,
      "prompt": "Texto de la pregunta",
      "options": [
        { "key": "a", "text": "Opción A", "isCorrect": false },
        { "key": "b", "text": "Opción B", "isCorrect": true }
      ]
    }
  ],
  "answers": [{ "examQuestionId": "eq-1", "selectedKeys": ["a"] }]
}
```

Errores:

- `401` sin autenticación.
- `403` sin permisos para el examen.
- `404` examen inexistente.
- `409` examen todavía no finalizado.

Nota: `GET /exams/:examId` (quiz) no expone respuestas correctas.

## Users referees stats

`GET /users/referees?competitionId=<id>`

Además de los campos base del usuario, la respuesta ahora incluye estadísticas agregadas:

- `practiceTestsCount`
- `practiceAverage` (escala 0-10)
- `finalTestsPassedCount`
- `finalTestsTotalCount`
- `finalAverage` (escala 0-10)
- `clipsCount`
- `commentsCount`

Estas métricas se persisten en `UserStats` (1:1 con `User`) y se actualizan en tiempo real cuando:

- se finaliza un examen de práctica/final
- se crea un clip
- se crea un comentario

## Admin dashboard summary

`GET /users/stats/summary` (solo `ADMIN`)

Retorna los datos de las cards del dashboard:

- `refereesCount`
- `practiceTestsCount`
- `finalAverageGlobal` (escala 0-10)
- `clipsUploadedCount`

## Admin final evolution

`GET /users/stats/final-evolution?months=6` (solo `ADMIN`)

Serie mensual del promedio de exámenes finales (`FINISHED` + `FINAL`) usando `finishedAt`.

Respuesta:

```json
{
  "months": [
    { "month": "2025-09", "label": "Sep", "average": null, "examsCount": 0 },
    { "month": "2025-10", "label": "Oct", "average": 7.8, "examsCount": 2 },
    { "month": "2025-11", "label": "Nov", "average": null, "examsCount": 0 },
    { "month": "2025-12", "label": "Dic", "average": 8.4, "examsCount": 1 },
    { "month": "2026-01", "label": "Ene", "average": null, "examsCount": 0 },
    { "month": "2026-02", "label": "Feb", "average": null, "examsCount": 0 }
  ]
}
```

## Final exam catalog and retries

Los reintentos aplican solo a exámenes finales de catálogo.

- `POST /final-exams` (`ADMIN`): crea catálogo final.
- `POST /final-exams/:id/publish` (`ADMIN`): publica catálogo.
- `GET /final-exams/my` (autenticado): lista catálogos disponibles + estado de intentos del usuario.
- `GET /final-exams/:id/referees` (`ADMIN`): lista árbitros vinculados al catálogo, metadata del examen (fecha/competencias/preguntas/reintentos) y resumen (resoluciones/promedio/aprobados/pendientes).
- `POST /final-exams/:id/start` (autenticado): inicia o reanuda intento.

`POST /final-exams` acepta `title` opcional. Si no llega, se usa `"Examen"`.

`POST /final-exams` también acepta `availableUntilDate` opcional en formato `YYYY-MM-DD`.
Si llega, el final queda habilitado hasta el fin de ese día calendario en zona
horaria `America/Argentina/Cordoba` y se cierra al comenzar el día siguiente.

Reglas de reintentos:

- `maxRetries` define la cantidad total de intentos permitidos.
- `maxAttempts = maxRetries`.
- Si existe intento `PENDING`, se reanuda ese intento.
- Si el usuario ya aprobó el catálogo, no se habilitan más intentos.
- Si `usedAttempts >= maxAttempts`, responde `409`.
- Si `availableUntilDate` ya venció, el catálogo queda cerrado: no se puede iniciar,
  reanudar, responder ni finalizar un intento pendiente.

Nota: `POST /exams` ya no permite `examType=FINAL`; los finales se inician desde `/final-exams/:id/start`.
