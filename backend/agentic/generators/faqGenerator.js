export function generateFaqBlock(profile) {
  const faqs = profile.faqs || []
  if (faqs.length > 0) {
    return faqs.map(faq => ({
      question: faq.question || '',
      answer: faq.answer || '',
      sourceUrl: faq.sourceUrl || profile.source?.sourceUrl || '',
      sourceText: faq.sourceText || '',
      confidence: Number(faq.confidence) || 0,
      needsApproval: false,
    }))
  }

  return (profile.services || []).slice(0, 3).map(service => ({
    question: `What is ${service.name}?`,
    answer: '',
    sourceUrl: service.sourceUrl || profile.source?.sourceUrl || '',
    sourceText: service.sourceText || '',
    confidence: 0,
    needsApproval: true,
  }))
}
