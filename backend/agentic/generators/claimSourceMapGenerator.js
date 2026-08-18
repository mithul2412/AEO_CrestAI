export function generateClaimSourceMap(profile) {
  return (profile.claims || []).map(claim => ({
    claim: claim.claim || '',
    sourceUrl: claim.sourceUrl || profile.source?.sourceUrl || '',
    sourceText: claim.sourceText || '',
    claimType: claim.claimType || 'other',
    riskLevel: claim.riskLevel || 'low',
    confidence: Number(claim.confidence) || 0,
    approvalRequired: claim.claimType === 'pricing' || claim.riskLevel === 'high',
  }))
}
