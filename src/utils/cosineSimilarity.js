/**
 * Vector Math Utilities - Mathematical operations for embeddings
 * 
 * These utilities calculate similarity and distance between embedding vectors
 * Used in RAG retrieval, semantic search, and similarity matching
 * 
 * Vector Similarity Metrics:
 * 
 * 1. Cosine Similarity
 *    - Measures angle between vectors (0 to 1 for normalized)
 *    - Good for: Text embeddings, semantic similarity
 *    - Range: [-1, 1] (typically [0, 1] for normalized embeddings)
 *    - Advantage: Magnitude-independent, works well for high-dimensional data
 * 
 * 2. Euclidean Distance
 *    - Measures straight-line distance between points
 *    - Good for: Clustering, k-nearest neighbors
 *    - Range: [0, ∞]
 *    - Advantage: Intuitive, sensitive to magnitude differences
 * 
 * 3. Dot Product
 *    - Raw dot product (no normalization)
 *    - Good for: Fast similarity when vectors are pre-normalized
 *    - Range: [-∞, ∞]
 *    - Advantage: Fastest computation, can indicate both similarity and magnitude
 */

/**
 * Calculate cosine similarity between two vectors
 * 
 * Formula: similarity = (a · b) / (||a|| * ||b||)
 * 
 * This metric measures the angle between two vectors, treating them as directions
 * regardless of their magnitude. Perfect for comparing text embeddings.
 * 
 * Interpretation:
 * - 1.0 = identical direction (most similar)
 * - 0.0 = orthogonal (completely different)
 * - -1.0 = opposite direction (least similar)
 * 
 * Note: With normalized embeddings (from transformers), result is typically [0, 1]
 * 
 * @param {array<number>} vectorA - First embedding vector
 * @param {array<number>} vectorB - Second embedding vector
 * @returns {number} - Cosine similarity score [-1, 1]
 * @throws {Error} - If inputs are invalid
 */
export function cosineSimilarity(vectorA, vectorB) {
  try {
    // Input validation
    if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
      throw new Error('Both inputs must be arrays')
    }

    if (vectorA.length !== vectorB.length) {
      throw new Error(`Vector dimensions must match: ${vectorA.length} vs ${vectorB.length}`)
    }

    if (vectorA.length === 0) {
      throw new Error('Vectors cannot be empty')
    }

    // Validate all elements are numbers
    if (!vectorA.every(v => typeof v === 'number' && isFinite(v))) {
      throw new Error('Vector A contains non-numeric or infinite values')
    }

    if (!vectorB.every(v => typeof v === 'number' && isFinite(v))) {
      throw new Error('Vector B contains non-numeric or infinite values')
    }

    // Calculate dot product: sum of a[i] * b[i]
    let dotProduct = 0
    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i]
    }

    // Calculate magnitude of A: sqrt(sum of a[i]²)
    let magnitudeA = 0
    for (let i = 0; i < vectorA.length; i++) {
      magnitudeA += vectorA[i] * vectorA[i]
    }
    magnitudeA = Math.sqrt(magnitudeA)

    // Calculate magnitude of B: sqrt(sum of b[i]²)
    let magnitudeB = 0
    for (let i = 0; i < vectorB.length; i++) {
      magnitudeB += vectorB[i] * vectorB[i]
    }
    magnitudeB = Math.sqrt(magnitudeB)

    // Handle edge case: zero magnitude
    if (magnitudeA === 0 || magnitudeB === 0) {
      // One or both vectors have zero length
      // Cannot calculate similarity with zero-length vector
      console.warn('One or both vectors have zero magnitude. Returning 0.')
      return 0
    }

    // Calculate and return cosine similarity
    const similarity = dotProduct / (magnitudeA * magnitudeB)

    // Clamp result to [-1, 1] to handle floating point errors
    return Math.max(-1, Math.min(1, similarity))
  } catch (err) {
    console.error('Error calculating cosine similarity:', err)
    throw err
  }
}

/**
 * Calculate Euclidean distance between two vectors
 * 
 * Formula: distance = sqrt(sum of (a[i] - b[i])²)
 * 
 * This metric measures the straight-line distance between two points in space.
 * Good for algorithms like k-nearest neighbors and clustering.
 * 
 * Interpretation:
 * - 0 = identical vectors
 * - Higher values = more different
 * - Sensitive to magnitude differences
 * 
 * Example: Two embedding vectors with values that differ by 0.1 across all dimensions
 * will have a larger Euclidean distance than cosine similarity would suggest.
 * 
 * @param {array<number>} vectorA - First embedding vector
 * @param {array<number>} vectorB - Second embedding vector
 * @returns {number} - Euclidean distance [0, ∞]
 * @throws {Error} - If inputs are invalid
 */
export function euclideanDistance(vectorA, vectorB) {
  try {
    // Input validation
    if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
      throw new Error('Both inputs must be arrays')
    }

    if (vectorA.length !== vectorB.length) {
      throw new Error(`Vector dimensions must match: ${vectorA.length} vs ${vectorB.length}`)
    }

    if (vectorA.length === 0) {
      throw new Error('Vectors cannot be empty')
    }

    // Validate all elements are numbers
    if (!vectorA.every(v => typeof v === 'number' && isFinite(v))) {
      throw new Error('Vector A contains non-numeric or infinite values')
    }

    if (!vectorB.every(v => typeof v === 'number' && isFinite(v))) {
      throw new Error('Vector B contains non-numeric or infinite values')
    }

    // Calculate sum of squared differences: sum of (a[i] - b[i])²
    let sumSquaredDiff = 0
    for (let i = 0; i < vectorA.length; i++) {
      const diff = vectorA[i] - vectorB[i]
      sumSquaredDiff += diff * diff
    }

    // Return sqrt of sum
    return Math.sqrt(sumSquaredDiff)
  } catch (err) {
    console.error('Error calculating Euclidean distance:', err)
    throw err
  }
}

/**
 * Calculate dot product of two vectors
 * 
 * Formula: dotProduct = sum of a[i] * b[i]
 * 
 * This is the raw dot product without normalization.
 * Useful when vectors are already normalized and you want the fastest computation.
 * 
 * Interpretation:
 * - Positive = vectors point in similar directions
 * - Zero = vectors are orthogonal
 * - Negative = vectors point in opposite directions
 * - Magnitude indicates both angle AND vector magnitudes
 * 
 * Performance: Fastest similarity metric (no square roots or divisions)
 * 
 * @param {array<number>} vectorA - First embedding vector
 * @param {array<number>} vectorB - Second embedding vector
 * @returns {number} - Dot product [-∞, ∞]
 * @throws {Error} - If inputs are invalid
 */
export function dotProduct(vectorA, vectorB) {
  try {
    // Input validation
    if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
      throw new Error('Both inputs must be arrays')
    }

    if (vectorA.length !== vectorB.length) {
      throw new Error(`Vector dimensions must match: ${vectorA.length} vs ${vectorB.length}`)
    }

    if (vectorA.length === 0) {
      throw new Error('Vectors cannot be empty')
    }

    // Validate all elements are numbers
    if (!vectorA.every(v => typeof v === 'number' && isFinite(v))) {
      throw new Error('Vector A contains non-numeric or infinite values')
    }

    if (!vectorB.every(v => typeof v === 'number' && isFinite(v))) {
      throw new Error('Vector B contains non-numeric or infinite values')
    }

    // Calculate and return dot product
    let result = 0
    for (let i = 0; i < vectorA.length; i++) {
      result += vectorA[i] * vectorB[i]
    }

    return result
  } catch (err) {
    console.error('Error calculating dot product:', err)
    throw err
  }
}

/**
 * Calculate vector magnitude (L2 norm)
 * 
 * Formula: magnitude = sqrt(sum of a[i]²)
 * 
 * Useful for normalizing vectors to unit length.
 * 
 * @param {array<number>} vector - Embedding vector
 * @returns {number} - Vector magnitude [0, ∞]
 * @throws {Error} - If input is invalid
 */
export function magnitude(vector) {
  try {
    if (!Array.isArray(vector)) {
      throw new Error('Input must be an array')
    }

    if (vector.length === 0) {
      throw new Error('Vector cannot be empty')
    }

    if (!vector.every(v => typeof v === 'number' && isFinite(v))) {
      throw new Error('Vector contains non-numeric or infinite values')
    }

    let sum = 0
    for (let i = 0; i < vector.length; i++) {
      sum += vector[i] * vector[i]
    }

    return Math.sqrt(sum)
  } catch (err) {
    console.error('Error calculating magnitude:', err)
    throw err
  }
}

/**
 * Normalize a vector to unit length
 * 
 * Formula: normalized[i] = a[i] / magnitude
 * 
 * Used to prepare vectors for cosine similarity or other normalized operations.
 * 
 * @param {array<number>} vector - Vector to normalize
 * @returns {array<number>} - Normalized vector (magnitude = 1)
 * @throws {Error} - If input is invalid or zero-length
 */
export function normalize(vector) {
  try {
    if (!Array.isArray(vector)) {
      throw new Error('Input must be an array')
    }

    if (vector.length === 0) {
      throw new Error('Vector cannot be empty')
    }

    if (!vector.every(v => typeof v === 'number' && isFinite(v))) {
      throw new Error('Vector contains non-numeric or infinite values')
    }

    // Calculate magnitude
    let sum = 0
    for (let i = 0; i < vector.length; i++) {
      sum += vector[i] * vector[i]
    }
    const mag = Math.sqrt(sum)

    if (mag === 0) {
      throw new Error('Cannot normalize zero-length vector')
    }

    // Divide each component by magnitude
    return vector.map(v => v / mag)
  } catch (err) {
    console.error('Error normalizing vector:', err)
    throw err
  }
}

/**
 * Find the index of the maximum value in an array
 * 
 * Useful for finding the most similar vector in a batch.
 * 
 * @param {array<number>} values - Array of numbers
 * @returns {number} - Index of maximum value
 * @throws {Error} - If input is invalid
 */
export function argMax(values) {
  try {
    if (!Array.isArray(values)) {
      throw new Error('Input must be an array')
    }

    if (values.length === 0) {
      throw new Error('Array cannot be empty')
    }

    if (!values.every(v => typeof v === 'number' && isFinite(v))) {
      throw new Error('Array contains non-numeric or infinite values')
    }

    let maxIndex = 0
    let maxValue = values[0]

    for (let i = 1; i < values.length; i++) {
      if (values[i] > maxValue) {
        maxValue = values[i]
        maxIndex = i
      }
    }

    return maxIndex
  } catch (err) {
    console.error('Error finding argMax:', err)
    throw err
  }
}

/**
 * Find the indices of the top K values in an array
 * 
 * Useful for finding top K most similar vectors.
 * 
 * @param {array<number>} values - Array of numbers
 * @param {number} k - Number of top values to return
 * @returns {array<number>} - Indices sorted by value (descending)
 * @throws {Error} - If inputs are invalid
 */
export function topKIndices(values, k) {
  try {
    if (!Array.isArray(values)) {
      throw new Error('Values must be an array')
    }

    if (typeof k !== 'number' || k < 1 || k > values.length) {
      throw new Error(`K must be between 1 and array length (${values.length})`)
    }

    if (values.length === 0) {
      throw new Error('Values array cannot be empty')
    }

    if (!values.every(v => typeof v === 'number' && isFinite(v))) {
      throw new Error('Array contains non-numeric or infinite values')
    }

    // Create array of indices with values
    const indexed = values.map((val, idx) => ({ val, idx }))

    // Sort by value descending
    indexed.sort((a, b) => b.val - a.val)

    // Return top K indices
    return indexed.slice(0, k).map(item => item.idx)
  } catch (err) {
    console.error('Error finding top K indices:', err)
    throw err
  }
}

/**
 * Comparison guide for choosing the right metric
 * 
 * Use Cosine Similarity when:
 * - Comparing text embeddings (default for NLP/LLM)
 * - Direction matters more than magnitude
 * - Vectors are high-dimensional (1000+ dimensions)
 * - You want results normalized to [-1, 1]
 * 
 * Use Euclidean Distance when:
 * - Comparing spatial coordinates
 * - Clustering or k-means algorithms
 * - Magnitude differences are important
 * - You want intuitive distance metric
 * 
 * Use Dot Product when:
 * - Vectors are already normalized
 * - Maximum performance is critical
 * - Using with similarity thresholds
 */
