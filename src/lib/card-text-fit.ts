export type CardTextAlign =
  | "LEFT"
  | "CENTER"
  | "RIGHT";

function glyphFactor(
  character: string,
): number {
  if (/\s/.test(character)) {
    return 0.28;
  }

  if (/[ilI1.,'`|!:;]/.test(character)) {
    return 0.27;
  }

  if (/[mwMW@#%&]/.test(character)) {
    return 0.88;
  }

  if (/[ABCDEFGHJKLMNOPQRSTUVWXYZ023456789]/.test(character)) {
    return 0.63;
  }

  return 0.52;
}

export function estimateCardTextWidth(
  value: string,
  fontSize: number,
): number {
  return Array.from(value)
    .reduce(
      (total, character) =>
        total +
        glyphFactor(
          character,
        ) *
          fontSize,
      0,
    );
}

export function defaultCardTextMaxWidth(
  input: {
    x: number;
    align:
      CardTextAlign;
  },
): number {
  const gutter =
    0.025;

  if (
    input.align ===
    "LEFT"
  ) {
    return Math.max(
      0.08,
      1 -
        input.x -
        gutter,
    );
  }

  if (
    input.align ===
    "RIGHT"
  ) {
    return Math.max(
      0.08,
      input.x -
        gutter,
    );
  }

  return Math.max(
    0.08,
    2 *
      Math.min(
        input.x -
          gutter,
        1 -
          input.x -
          gutter,
      ),
  );
}

function splitLongWord(
  word: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  const pieces: string[] =
    [];
  let current = "";

  for (
    const character of
    Array.from(word)
  ) {
    const candidate =
      `${current}${character}`;

    if (
      current &&
      estimateCardTextWidth(
        candidate,
        fontSize,
      ) >
        maxWidth
    ) {
      pieces.push(
        current,
      );
      current =
        character;
    } else {
      current =
        candidate;
    }
  }

  if (current) {
    pieces.push(
      current,
    );
  }

  return pieces;
}

function wrapCardText(
  value: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  const words =
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .flatMap(
        (word) =>
          estimateCardTextWidth(
            word,
            fontSize,
          ) <=
          maxWidth
            ? [word]
            : splitLongWord(
                word,
                maxWidth,
                fontSize,
              ),
      );

  if (
    words.length ===
    0
  ) {
    return [""];
  }

  const lines: string[] =
    [];
  let current = "";

  for (
    const word of
    words
  ) {
    const candidate =
      current
        ? `${current} ${word}`
        : word;

    if (
      current &&
      estimateCardTextWidth(
        candidate,
        fontSize,
      ) >
        maxWidth
    ) {
      lines.push(
        current,
      );
      current =
        word;
    } else {
      current =
        candidate;
    }
  }

  if (current) {
    lines.push(
      current,
    );
  }

  return lines;
}

export function fitCardTextNormalized(
  input: {
    value: string;
    fontSize: number;
    minFontSize: number;
    maxWidth: number;
    maxLines: number;
  },
) {
  const requested =
    Math.max(
      0.006,
      input.fontSize,
    );
  const minimum =
    Math.min(
      requested,
      Math.max(
        0.006,
        input.minFontSize,
      ),
    );
  const maxWidth =
    Math.max(
      0.05,
      Math.min(
        1,
        input.maxWidth,
      ),
    );
  const maxLines =
    Math.max(
      1,
      Math.min(
        3,
        Math.trunc(
          input.maxLines,
        ),
      ),
    );

  let fontSize =
    requested;

  while (
    fontSize >
      minimum +
        0.0005
  ) {
    const lines =
      wrapCardText(
        input.value,
        maxWidth,
        fontSize,
      );

    if (
      lines.length <=
      maxLines
    ) {
      return {
        fontSize,
        lines,
      };
    }

    fontSize =
      Math.max(
        minimum,
        Number(
          (
            fontSize -
            0.001
          ).toFixed(
            4,
          ),
        ),
      );
  }

  const lines =
    wrapCardText(
      input.value,
      maxWidth,
      minimum,
    );

  if (
    lines.length <=
    maxLines
  ) {
    return {
      fontSize:
        minimum,
      lines,
    };
  }

  const kept =
    lines.slice(
      0,
      maxLines,
    );
  let finalLine =
    kept[
      kept.length -
        1
    ] ?? "";

  while (
    finalLine.length >
      1 &&
    estimateCardTextWidth(
      `${finalLine}…`,
      minimum,
    ) >
      maxWidth
  ) {
    finalLine =
      finalLine.slice(
        0,
        -1,
      );
  }

  kept[
    kept.length -
      1
  ] =
    `${finalLine.trimEnd()}…`;

  return {
    fontSize:
      minimum,
    lines:
      kept,
  };
}
