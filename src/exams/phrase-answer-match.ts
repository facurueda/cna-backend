/**
 * Matching de respuestas de examen de búsqueda (referencias al reglamento).
 *
 * El árbitro escribe libremente dónde está la frase ("7.8 b", "Aclaración 7",
 * "acl. 7", "Art 12.4", "10.4 2do párrafo", "SAR"). En vez de comparar texto
 * plano contra la respuesta cargada por el admin, parseamos ambas a una forma
 * canónica `tipo + camino` y comparamos eso.
 *
 * Lo que se corrige es la regla y, si la respuesta lo trae, el inciso:
 * "15.2", "11.4", "8.8 b", "17.3 D". El párrafo, la línea o la nota son
 * ubicación dentro de la regla y se descartan, así que "10.4",
 * "10.4 2do párrafo" y "10.4 párrafo 2" son la misma respuesta.
 *
 * El camino es jerárquico ("8.8 b" -> ["8", "8", "b"]) y una respuesta es
 * correcta cuando el camino esperado es prefijo del escrito: el árbitro puede
 * ser más preciso que la respuesta cargada, pero no menos (si esperamos
 * "8.8 b", "8.8" a secas no alcanza).
 */

/** Tipo de documento: define contra qué se compara la referencia. */
type AnswerKind =
  | 'regla'
  | 'articulo'
  | 'aclaracion'
  | 'apendice'
  | 'anexo'
  | 'interpretacion'
  | 'seccion'
  | 'parrafo'
  | 'inciso'
  | 'nota'
  | 'sar';

/** Ubicación dentro de una regla: no cambia el tipo, agrega precisión. */
type RefinementKind = 'parrafo' | 'inciso' | 'linea' | 'nota';

/** Forma larga de cada tipo. Se aceptan abreviaturas por prefijo. */
const KIND_WORDS: Record<Exclude<AnswerKind, RefinementKind>, string[]> = {
  regla: ['regla', 'reglas', 'reglamento'],
  articulo: ['articulo', 'articulos'],
  aclaracion: ['aclaracion', 'aclaraciones'],
  apendice: ['apendice', 'apendices'],
  anexo: ['anexo', 'anexos'],
  interpretacion: ['interpretacion', 'interpretaciones'],
  seccion: ['seccion', 'secciones'],
  sar: ['sar', 'sars'],
};

const REFINEMENT_WORDS: Record<RefinementKind, string[]> = {
  parrafo: ['parrafo', 'parrafos'],
  inciso: ['inciso', 'incisos', 'apartado', 'apartados', 'letra'],
  linea: ['linea', 'lineas', 'renglon'],
  nota: ['nota', 'notas'],
};

/**
 * Abreviaturas de una a tres letras que por prefijo serían ambiguas
 * (ej: "a" podría ser articulo/aclaracion/apendice/anexo).
 */
const KIND_SHORTHANDS: Record<string, AnswerKind> = {
  r: 'regla',
  art: 'articulo',
  ac: 'aclaracion',
  acl: 'aclaracion',
  ap: 'apendice',
  int: 'interpretacion',
  sec: 'seccion',
};

const REFINEMENT_SHORTHANDS: Record<string, RefinementKind> = {
  parr: 'parrafo',
  par: 'parrafo',
  inc: 'inciso',
  lin: 'linea',
};

/** Palabras de relleno que no aportan a la comparación. */
const STOP_WORDS = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'en',
  'y',
  'o',
  'punto',
  'pto',
  'numero',
  'nro',
  'n',
  'item',
]);

/** Ordinales escritos con palabras: "segundo párrafo" -> "2 párrafo". */
const ORDINAL_WORDS: Record<string, string> = {
  primer: '1',
  primero: '1',
  primera: '1',
  segundo: '2',
  segunda: '2',
  tercer: '3',
  tercero: '3',
  tercera: '3',
  cuarto: '4',
  cuarta: '4',
  quinto: '5',
  quinta: '5',
  sexto: '6',
  sexta: '6',
  septimo: '7',
  septima: '7',
  octavo: '8',
  octava: '8',
  noveno: '9',
  novena: '9',
  decimo: '10',
  decima: '10',
  ultimo: 'ultimo',
  ultima: 'ultimo',
};

/** Sufijos ordinales pegados al número: "2do", "3er", "1ra". */
const ORDINAL_SUFFIXES = new Set([
  'ro',
  'do',
  'er',
  'to',
  'mo',
  'ma',
  'vo',
  'va',
  'no',
  'na',
  'ra',
  'da',
]);

/** Separadores para cargar varias respuestas válidas en un mismo campo. */
const VARIANT_SEPARATORS = /[|;]+/;

type Token =
  /** Segmentos escritos juntos: "10.4" es un solo token de dos segmentos. */
  | { type: 'value'; segments: string[] }
  | { type: 'kind'; kind: AnswerKind }
  | { type: 'refinement'; kind: RefinementKind }
  | { type: 'word'; value: string };

type ParsedAnswer = {
  /** Tipo de referencia; `null` cuando no se pudo determinar. */
  kind: AnswerKind | null;
  /** Camino canónico jerárquico, ej. ["10", "4", "p2"]. */
  path: string[];
  /** Palabras que no son tipo ni relleno (respuestas de texto libre). */
  words: string[];
  /** Más de una referencia escrita ("10.4 y 10.5"): no se puede dar por válida. */
  hasMultipleReferences: boolean;
};

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    previous = current;
  }

  return previous[b.length];
}

/** Dos palabras son "la misma" si una abrevia a la otra o hay un typo de una letra. */
function tokensAreSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 2 && b.startsWith(a)) return true;
  if (b.length >= 2 && a.startsWith(b)) return true;
  return Math.max(a.length, b.length) >= 4 && levenshtein(a, b) <= 1;
}

type ResolvedWord =
  | { scope: 'kind'; kind: AnswerKind }
  | { scope: 'refinement'; kind: RefinementKind }
  | null;

function resolveWord(token: string): ResolvedWord {
  const kindShorthand = KIND_SHORTHANDS[token];
  if (kindShorthand) return { scope: 'kind', kind: kindShorthand };

  const refinementShorthand = REFINEMENT_SHORTHANDS[token];
  if (refinementShorthand) {
    return { scope: 'refinement', kind: refinementShorthand };
  }

  const matches: ResolvedWord[] = [];

  for (const [kind, words] of Object.entries(KIND_WORDS) as [
    AnswerKind,
    string[],
  ][]) {
    if (words.some((word) => tokensAreSimilar(word, token))) {
      matches.push({ scope: 'kind', kind });
    }
  }

  for (const [kind, words] of Object.entries(REFINEMENT_WORDS) as [
    RefinementKind,
    string[],
  ][]) {
    if (words.some((word) => tokensAreSimilar(word, token))) {
      matches.push({ scope: 'refinement', kind });
    }
  }

  // Una abreviatura que encaja con varios tipos no permite decidir.
  return matches.length === 1 ? matches[0] : null;
}

function normalizeNumberSegment(segment: string): string | null {
  const trimmed = segment.replace(/^0+(?=\d)/, '');
  return trimmed.length > 0 ? trimmed : null;
}

function tokenize(raw: string): Token[] {
  const cleaned = stripAccents(raw)
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/[^a-z0-9. ]+/g, ' ')
    // punto de abreviatura: "acl." -> "acl", "art." -> "art"
    .replace(/([a-z])\.+/g, '$1 ')
    // separa números pegados a letras: "7.8b" -> "7.8 b", "art7" -> "art 7"
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2');

  const rawTokens = cleaned.split(/\s+/).filter(Boolean);
  const tokens: Token[] = [];

  rawTokens.forEach((rawToken, index) => {
    const token = ORDINAL_WORDS[rawToken] ?? rawToken;

    if (/^[\d.]+$/.test(token)) {
      const segments = token
        .split('.')
        .map(normalizeNumberSegment)
        .filter((segment): segment is string => segment !== null);
      if (segments.length > 0) tokens.push({ type: 'value', segments });
      return;
    }

    // Sufijo ordinal suelto tras el split numérico: "2do" -> "2" + "do".
    if (
      ORDINAL_SUFFIXES.has(token) &&
      /^\d+$/.test(rawTokens[index - 1] ?? '')
    ) {
      return;
    }

    // Una letra suelta es un inciso solo si ya hay a qué colgarla ("7.8 b");
    // si no, puede ser una abreviatura del tipo ("r 7.8").
    if (/^[a-z]$/.test(token)) {
      const previous = tokens[tokens.length - 1];
      if (previous?.type === 'value' || previous?.type === 'refinement') {
        tokens.push({ type: 'value', segments: [token] });
        return;
      }
    }

    if (STOP_WORDS.has(token)) return;

    const resolved = resolveWord(token);
    if (resolved?.scope === 'kind') {
      tokens.push({ type: 'kind', kind: resolved.kind });
      return;
    }
    if (resolved?.scope === 'refinement') {
      tokens.push({ type: 'refinement', kind: resolved.kind });
      return;
    }

    tokens.push({ type: 'word', value: token });
  });

  return tokens;
}

function parseAnswer(raw: string): ParsedAnswer {
  const tokens = tokenize(raw);

  let kind: AnswerKind | null = null;
  const refinements: { kind: RefinementKind; value: string | null }[] = [];
  const consumed = new Set<number>();
  const words: string[] = [];

  /**
   * Un refinamiento se queda con el número contiguo suelto: en "10.4 2 párrafo"
   * el 2 es el párrafo, no un tercer nivel de la regla. Solo puede tomar un
   * token de un segmento, así que "10.4 párrafo 2" no le entrega la 10.4.
   */
  const takeValueAt = (index: number): string | null => {
    const token = tokens[index];
    if (!token || token.type !== 'value') return null;
    if (consumed.has(index) || token.segments.length !== 1) return null;
    return token.segments[0];
  };

  tokens.forEach((token, index) => {
    if (token.type !== 'refinement') return;

    let value = takeValueAt(index + 1);
    if (value !== null) {
      consumed.add(index + 1);
    } else {
      value = takeValueAt(index - 1);
      if (value !== null) consumed.add(index - 1);
    }

    refinements.push({ kind: token.kind, value });
    consumed.add(index);
  });

  const path: string[] = [];

  tokens.forEach((token, index) => {
    if (consumed.has(index)) return;

    if (token.type === 'value') {
      path.push(...token.segments);
      return;
    }
    if (token.type === 'kind') {
      kind ??= token.kind;
      return;
    }
    if (token.type === 'word') {
      words.push(token.value);
    }
  });

  // Solo el inciso forma parte de la respuesta. El párrafo, la línea y la nota
  // ya quedaron fuera del camino: su único efecto fue quedarse con su número
  // para que no se cuele como un nivel más de la regla.
  for (const refinement of refinements) {
    // El inciso también se escribe como letra suelta ("10.4 b"), así que
    // "10.4 inciso b" tiene que dar exactamente el mismo camino.
    if (refinement.kind === 'inciso' && refinement.value !== null) {
      path.push(refinement.value);
    }
  }

  // Dos referencias completas ("10.4 y 10.5") no son una respuesta: el árbitro
  // tiene que decidirse, si no alcanzaría con listar medio reglamento.
  const hasMultipleReferences =
    tokens.filter(
      (token) => token.type === 'value' && token.segments.length > 1,
    ).length > 1;

  // "Nota 3" o "Párrafo 2" sueltos, sin regla: el refinamiento es la
  // referencia entera y no hay nada dentro de lo que ubicarlo.
  if (kind === null && refinements.length === 1 && path.length === 0) {
    const [only] = refinements;
    if (only.kind !== 'linea') {
      return {
        kind: only.kind,
        path: only.value ? [only.value] : [],
        words,
        hasMultipleReferences,
      };
    }
  }

  return { kind, path, words, hasMultipleReferences };
}

/** Sin tipo explícito asumimos "regla": "7.8 b" === "Regla 7.8 b". */
function effectiveKind(parsed: ParsedAnswer): AnswerKind {
  return parsed.kind ?? 'regla';
}

/** El árbitro puede ser más preciso que la respuesta esperada, no menos. */
function pathIsPrefix(expected: string[], submitted: string[]): boolean {
  if (expected.length > submitted.length) return false;
  return expected.every((segment, index) => segment === submitted[index]);
}

function wordsAreEquivalent(expected: string[], submitted: string[]): boolean {
  if (expected.length !== submitted.length) return false;
  return expected.every((word, index) =>
    tokensAreSimilar(word, submitted[index]),
  );
}

function matchesVariant(expectedRaw: string, submittedRaw: string): boolean {
  const expected = parseAnswer(expectedRaw);
  const submitted = parseAnswer(submittedRaw);

  if (submitted.hasMultipleReferences) return false;

  if (expected.path.length > 0 || submitted.path.length > 0) {
    return (
      effectiveKind(expected) === effectiveKind(submitted) &&
      pathIsPrefix(expected.path, submitted.path)
    );
  }

  // Respuestas sin números: "SAR", "Apéndice", o texto libre.
  if (expected.kind !== null || submitted.kind !== null) {
    return (
      expected.kind === submitted.kind &&
      wordsAreEquivalent(expected.words, submitted.words)
    );
  }

  return (
    expected.words.length > 0 &&
    wordsAreEquivalent(expected.words, submitted.words)
  );
}

/**
 * Compara la respuesta del árbitro contra la esperada.
 * La esperada puede traer variantes separadas por `|` o `;`
 * (ej: "7.8 b | Aclaración 7"): alcanza con que matchee una.
 */
export function isPhraseAnswerCorrect(
  expectedAnswer: string | null | undefined,
  submittedAnswer: string | null | undefined,
): boolean {
  if (!expectedAnswer?.trim() || !submittedAnswer?.trim()) return false;

  return expectedAnswer
    .split(VARIANT_SEPARATORS)
    .map((variant) => variant.trim())
    .filter(Boolean)
    .some((variant) => matchesVariant(variant, submittedAnswer));
}
