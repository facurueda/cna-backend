import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export type FinalExamActivityKind = 'STARTED' | 'FINISHED';

export type FinalExamActivityEvent = {
  catalogId: string;
  userId: string;
  examId: string;
  kind: FinalExamActivityKind;
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
