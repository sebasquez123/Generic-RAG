// import type { Logger, QueryRunner } from 'typeorm';

// import logger from '~/logger';

// export class QueryLogger implements Logger {
//   logQuery(query: string, parameters?: unknown[], _queryRunner?: QueryRunner) {
//     logger.trace({ query, parameters }, 'New DB query');
//   }

//   logQueryError(error: string | Error, query: string, parameters?: unknown[], _queryRunner?: QueryRunner) {
//     if (error instanceof Error) {
//       logger.warn({ error, query, parameters }, 'Errored DB query');
//     } else {
//       logger.warn({ errorMessage: error, query, parameters }, 'Errored DB query');
//     }
//   }

//   logQuerySlow(time: number, query: string, parameters?: unknown[], _queryRunner?: QueryRunner) {
//     logger.warn({ query, parameters, time }, 'Slow DB query');
//   }

//   logSchemaBuild(message: string, queryRunner?: QueryRunner) {
//     logger.trace(message, queryRunner);
//   }

//   logMigration(message: string, queryRunner?: QueryRunner) {
//     logger.info(message, queryRunner);
//   }

//   log(level: 'log' | 'info' | 'warn', message: unknown, _queryRunner?: QueryRunner) {
//     switch (level) {
//       case 'log':
//       case 'info': {
//         logger.trace({ typeOrmMessage: message, level }, 'DB log');
//         break;
//       }
//       case 'warn': {
//         logger.warn({ typeOrmMessage: message }, 'DB warn');
//         break;
//       }
//     }
//   }
// }
