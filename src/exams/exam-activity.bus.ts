import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export type FinalExamActivityKind = 'STARTED' | 'FINISHED' | 'PROGRESS';

/** Respuestas que cambiaron en una sincronizacion (no el examen completo). */
export type FinalExamProgressAnswer = {
  examQuestionId: string;
  selectedKeys: string[];
  freeText?: string | null;
  /** Solo en examenes de frases, donde el cliente no puede calcularlo. */
  isCorrect?: boolean;
};

export type FinalExamProgress = {
  answered: number;
  total: number;
  /** Resultado parcial: lo que daria el examen si se cerrara ahora. */
  scorePercent: number;
  answers: FinalExamProgressAnswer[];
};

export type FinalExamActivityEvent = {
  catalogId: string;
  userId: string;
  examId: string;
  kind: FinalExamActivityKind;
  progress?: FinalExamProgress;
};

/**
 * Bus en memoria: ExamsService publica cuando un examen final arranca o termina y
 * el gateway de websocket lo reenvia a los admins que estan mirando ese examen.
 * Es de un solo proceso; si la API se escala a varias instancias hace falta un
 * adapter (p. ej. Redis) para que el evento llegue a todas.
 */
@Injectable()
export class ExamActivityBus {
  private readonly subject = new Subject<FinalExamActivityEvent>();

  readonly events$: Observable<FinalExamActivityEvent> =
    this.subject.asObservable();

  publish(event: FinalExamActivityEvent) {
    this.subject.next(event);
  }
}
