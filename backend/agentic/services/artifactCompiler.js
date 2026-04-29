import { generateActionMetadata } from '../generators/actionMetadataGenerator.js'
import { generateAlternateLinkSnippet } from '../generators/alternateLinkGenerator.js'
import { generateClaimSourceMap } from '../generators/claimSourceMapGenerator.js'
import { generateFaqBlock } from '../generators/faqGenerator.js'
import { generateJsonLd } from '../generators/jsonLdGenerator.js'
import { generateLlmsFullTxt } from '../generators/llmsFullTxtGenerator.js'
import { generateLlmsTxt } from '../generators/llmsTxtGenerator.js'
import { generateRobotsRecommendations } from '../generators/robotsRecommendationGenerator.js'
import { generateStructuredServiceProductData } from '../generators/structuredDataGenerator.js'

export function compileArtifacts(profile, options = {}) {
  return {
    llmsTxt: generateLlmsTxt(profile, options),
    llmsFullTxt: generateLlmsFullTxt(profile, options),
    jsonLd: generateJsonLd(profile, options),
    faqBlock: generateFaqBlock(profile, options),
    actionMetadata: generateActionMetadata(profile, options),
    claimSourceMap: generateClaimSourceMap(profile, options),
    structuredServiceProductData: generateStructuredServiceProductData(profile, options),
    robotsRecommendations: generateRobotsRecommendations(profile, options),
    alternateLinkSnippet: generateAlternateLinkSnippet(profile, options),
  }
}
