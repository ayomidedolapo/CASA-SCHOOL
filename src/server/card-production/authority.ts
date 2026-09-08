export type CardProductionAuthority =
  | {
      kind:
        "SCHOOL_MEMBERSHIP";
      issuedByMembershipId:
        string;
      passkeyGrantId:
        string;
    }
  | {
      kind:
        "CASA_INTERNAL_RENEWAL";
      renewalBatchItemId:
        string;
    };

export function schoolMembershipCardProductionAuthority(
  input: {
    issuedByMembershipId:
      string;
    passkeyGrantId:
      string;
  },
): CardProductionAuthority {
  return {
    kind:
      "SCHOOL_MEMBERSHIP",
    issuedByMembershipId:
      input.issuedByMembershipId,
    passkeyGrantId:
      input.passkeyGrantId,
  };
}

export function casaInternalRenewalCardProductionAuthority(
  renewalBatchItemId:
    string,
): CardProductionAuthority {
  return {
    kind:
      "CASA_INTERNAL_RENEWAL",
    renewalBatchItemId,
  };
}

export function toCardProductionAuthorityColumns(
  authority:
    CardProductionAuthority,
) {
  if (
    authority.kind ===
    "SCHOOL_MEMBERSHIP"
  ) {
    return {
      productionAuthority:
        "SCHOOL_MEMBERSHIP" as const,
      issuedByMembershipId:
        authority.issuedByMembershipId,
      passkeyGrantId:
        authority.passkeyGrantId,
      internalAuthorityReference:
        null,
    };
  }

  return {
    productionAuthority:
      "CASA_INTERNAL_RENEWAL" as const,
    issuedByMembershipId:
      null,
    passkeyGrantId:
      null,
    internalAuthorityReference:
      authority.renewalBatchItemId,
  };
}
