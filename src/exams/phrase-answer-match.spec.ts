import { isPhraseAnswerCorrect } from './phrase-answer-match';

describe('isPhraseAnswerCorrect', () => {
  describe('abreviaturas del tipo de referencia', () => {
    it.each([
      'Aclaracion 7',
      'aclaración 7',
      'Aclaraciones 7',
      'Aclar 7',
      'Acl. 7',
      'AC 7',
      'aclaracion nro 7',
      'aclaracon 7',
      'aclaracion7',
    ])('acepta "%s" para "Aclaración 7"', (submitted) => {
      expect(isPhraseAnswerCorrect('Aclaración 7', submitted)).toBe(true);
    });

    it.each(['Art 12.4', 'articulo 12.4', 'ART. 12,4', 'art12.4'])(
      'acepta "%s" para "Artículo 12.4"',
      (submitted) => {
        expect(isPhraseAnswerCorrect('Artículo 12.4', submitted)).toBe(true);
      },
    );

    it('acepta SAR en cualquier capitalización', () => {
      expect(isPhraseAnswerCorrect('SAR', 'sar')).toBe(true);
      expect(isPhraseAnswerCorrect('SAR', 'Sar')).toBe(true);
    });
  });

  describe('formato del número de regla', () => {
    it.each(['7.8 b', '7.8b', '7.8-b', '7,8 B', 'Regla 7.8 b', 'r 7.8b', '07.8 b'])(
      'acepta "%s" para "7.8 b"',
      (submitted) => {
        expect(isPhraseAnswerCorrect('7.8 b', submitted)).toBe(true);
      },
    );

    it('acepta la regla escrita sin la palabra "regla"', () => {
      expect(isPhraseAnswerCorrect('Regla 7.8 b', '7.8 b')).toBe(true);
    });
  });

  describe('respuestas incorrectas', () => {
    it('no acepta otro inciso', () => {
      expect(isPhraseAnswerCorrect('7.8 b', '7.8 c')).toBe(false);
    });

    it('no acepta otro número', () => {
      expect(isPhraseAnswerCorrect('7.8 b', '7.9 b')).toBe(false);
      expect(isPhraseAnswerCorrect('Aclaración 7', 'Aclaración 8')).toBe(false);
    });

    it('no acepta la regla cuando se pide una aclaración', () => {
      expect(isPhraseAnswerCorrect('Aclaración 7', '7')).toBe(false);
      expect(isPhraseAnswerCorrect('Aclaración 7', 'Regla 7')).toBe(false);
      expect(isPhraseAnswerCorrect('7', 'Aclaración 7')).toBe(false);
    });

    it('no acepta una abreviatura ambigua', () => {
      expect(isPhraseAnswerCorrect('Aclaración 7', 'a 7')).toBe(false);
    });

    it('no acepta respuestas vacías', () => {
      expect(isPhraseAnswerCorrect('7.8 b', '')).toBe(false);
      expect(isPhraseAnswerCorrect('7.8 b', '   ')).toBe(false);
      expect(isPhraseAnswerCorrect('7.8 b', null)).toBe(false);
      expect(isPhraseAnswerCorrect(null, '7.8 b')).toBe(false);
    });

    it('no acepta la regla sin el inciso esperado', () => {
      expect(isPhraseAnswerCorrect('7.8 b', '7.8')).toBe(false);
      expect(isPhraseAnswerCorrect('8.8 b', '8.8')).toBe(false);
    });
  });

  describe('formatos de respuesta reales', () => {
    it.each(['15.2', '11.4', '17.3'])(
      'corrige la regla "%s" sin inciso',
      (answer) => {
        expect(isPhraseAnswerCorrect(answer, answer)).toBe(true);
        expect(isPhraseAnswerCorrect(answer, `regla ${answer}`)).toBe(true);
        expect(isPhraseAnswerCorrect(answer, `${answer} 2do párrafo`)).toBe(
          true,
        );
      },
    );

    it.each([
      ['8.8 b', '8.8b'],
      ['10.4 c', '10.4 C'],
      ['17.3 D', '17.3 d'],
      ['13.8 a', '13.8 a)'],
      ['13.8 a', 'regla 13.8 inciso a'],
      ['8.8 b', '8.8 b 3er párrafo'],
    ])('corrige "%s" escrito como "%s"', (expected, submitted) => {
      expect(isPhraseAnswerCorrect(expected, submitted)).toBe(true);
    });

    it('no confunde incisos entre sí', () => {
      expect(isPhraseAnswerCorrect('10.4 c', '10.4 b')).toBe(false);
      expect(isPhraseAnswerCorrect('13.8 a', '13.8 d')).toBe(false);
    });
  });

  describe('el párrafo se ignora', () => {
    it.each([
      '10.4 2 parrafo',
      '10.4 2 parr',
      '10.4 2do párrafo',
      '10.4 segundo parrafo',
      '10.4 párrafo 2',
      '10.4 par. 2',
      '10.4 último párrafo',
      '10.4 3er párrafo línea 2',
    ])('acepta "%s" para "10.4"', (submitted) => {
      expect(isPhraseAnswerCorrect('10.4', submitted)).toBe(true);
    });

    it('da igual qué párrafo diga: se corrige la regla', () => {
      expect(isPhraseAnswerCorrect('10.4 2do párrafo', '10.4')).toBe(true);
      expect(isPhraseAnswerCorrect('10.4 2do párrafo', '10.4 3er párrafo')).toBe(
        true,
      );
    });

    it('el número del párrafo no se cuela como nivel de la regla', () => {
      // "10.4.2" es la regla 10.4.2, no el párrafo 2 de la 10.4
      expect(isPhraseAnswerCorrect('10.4.2', '10.4 2do párrafo')).toBe(false);
      expect(isPhraseAnswerCorrect('10.4 2do párrafo', '10.5')).toBe(false);
    });

    it('el párrafo tampoco pisa el inciso', () => {
      expect(isPhraseAnswerCorrect('10.4 b', '10.4 2do párrafo')).toBe(false);
      expect(isPhraseAnswerCorrect('10.4 b', '10.4 2do párrafo inciso b')).toBe(
        true,
      );
    });
  });

  describe('precisión de más', () => {
    it('acepta un inciso más específico que el esperado', () => {
      expect(isPhraseAnswerCorrect('7.8', '7.8 b')).toBe(true);
      expect(isPhraseAnswerCorrect('7.8', '7.8 inciso b')).toBe(true);
      expect(isPhraseAnswerCorrect('7.8', 'regla 7.8 letra b')).toBe(true);
    });

    it('escribir el inciso con o sin la palabra da lo mismo', () => {
      expect(isPhraseAnswerCorrect('7.8 b', '7.8 inciso b')).toBe(true);
      expect(isPhraseAnswerCorrect('7.8 inciso b', '7.8 b')).toBe(true);
      expect(isPhraseAnswerCorrect('7.8 b', '7.8 apartado b')).toBe(true);
    });

    it('el orden de los refinamientos no importa', () => {
      expect(
        isPhraseAnswerCorrect('10.4 b 2do párrafo', '10.4 2do párrafo inciso b'),
      ).toBe(true);
    });

    it('acepta el refinamiento suelto como referencia', () => {
      expect(isPhraseAnswerCorrect('Párrafo 2', '2do parrafo')).toBe(true);
      expect(isPhraseAnswerCorrect('Nota 3', 'nota 3')).toBe(true);
      expect(isPhraseAnswerCorrect('Nota 3', '3')).toBe(false);
    });

    it('no acepta que el árbitro liste varias reglas', () => {
      expect(isPhraseAnswerCorrect('10.4', '10.4 y 10.5')).toBe(false);
      expect(isPhraseAnswerCorrect('10.4', '10.4 10.5 10.6')).toBe(false);
      expect(isPhraseAnswerCorrect('10.4', 'la frase está en 10.4')).toBe(true);
    });

    it('no acepta más precisión sobre otra regla', () => {
      expect(isPhraseAnswerCorrect('10.4', '10.5 2do párrafo')).toBe(false);
      expect(isPhraseAnswerCorrect('10.4', 'aclaración 10.4 2do párrafo')).toBe(
        false,
      );
    });
  });

  describe('variantes cargadas por el admin', () => {
    it('acepta cualquiera de las alternativas separadas por |', () => {
      expect(isPhraseAnswerCorrect('7.8 b | Aclaración 7', '7.8 b')).toBe(true);
      expect(isPhraseAnswerCorrect('7.8 b | Aclaración 7', 'acl 7')).toBe(true);
      expect(isPhraseAnswerCorrect('7.8 b | Aclaración 7', '9.1')).toBe(false);
    });

    it('también acepta ; como separador', () => {
      expect(isPhraseAnswerCorrect('SAR ; Apéndice B', 'apendice b')).toBe(true);
    });
  });

  describe('respuestas de texto libre', () => {
    it('acepta la misma frase con tildes distintas', () => {
      expect(
        isPhraseAnswerCorrect('Saque de banda', 'saque de banda'),
      ).toBe(true);
      expect(isPhraseAnswerCorrect('Situación de gol', 'situacion de gol')).toBe(
        true,
      );
    });

    it('rechaza una frase distinta', () => {
      expect(isPhraseAnswerCorrect('Saque de banda', 'saque de esquina')).toBe(
        false,
      );
    });
  });
});
