export type SessionInvoiceBranch = {
  id: string;
  name: string;
  code: string;
  isHeadquarters: boolean;
  activeStudentCount: number;
};

export type SessionInvoiceBranchAllocation = SessionInvoiceBranch & {
  amountKobo: number;
};

export function allocateSessionSubtotalAcrossBranches(
  totalKobo: number,
  branches: SessionInvoiceBranch[],
): SessionInvoiceBranchAllocation[] {
  if (!Number.isSafeInteger(totalKobo) || totalKobo < 0) {
    throw new Error(
      "Session invoice subtotal must be a non-negative integer number of kobo.",
    );
  }

  if (branches.length === 0) return [];

  const activeTotal = branches.reduce(
    (sum, branch) =>
      sum + Math.max(Number(branch.activeStudentCount) || 0, 0),
    0,
  );

  const weights =
    activeTotal > 0
      ? branches.map((branch) =>
          Math.max(Number(branch.activeStudentCount) || 0, 0),
        )
      : branches.map(() => 1);

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) {
    throw new Error("Session invoice branch allocation has no usable weights.");
  }

  const exactShares = weights.map(
    (weight) => (totalKobo * weight) / totalWeight,
  );
  const amounts = exactShares.map((share) => Math.floor(share));

  let remainder =
    totalKobo - amounts.reduce((sum, amount) => sum + amount, 0);

  const remainderOrder = exactShares
    .map((share, index) => ({
      index,
      fraction: share - Math.floor(share),
    }))
    .sort(
      (left, right) =>
        right.fraction - left.fraction || left.index - right.index,
    );

  let cursor = 0;
  while (remainder > 0) {
    amounts[remainderOrder[cursor].index] += 1;
    remainder -= 1;
    cursor = (cursor + 1) % remainderOrder.length;
  }

  return branches.map((branch, index) => ({
    ...branch,
    amountKobo: amounts[index],
  }));
}
