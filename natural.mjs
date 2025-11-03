import natural from 'natural';

// Input data
const searchResults = [
  { name1: 'zhejiang bozhong medical technology' },
  { name1: 'hangzhou baocheng biotechnology co.' },
  { name1: 'zhejiang bozhong medical technology co ltd' }
];

// Query name
const queryName = 'Hangzhou Baocheng Biotechnology Co., Ltd.';

// Threshold for similarity
const threshold = 0.6;

// Compare query name with each result
const resultsWithSimilarity = searchResults.map(result => {
  const similarity = natural.JaroWinklerDistance(queryName.toLowerCase(), result.name1.toLowerCase());
  return { ...result, similarity };
});

// Filter results with similarity above threshold
const filteredResults = resultsWithSimilarity.filter(result => result.similarity >= threshold);

// Sort by similarity in descending order
const sortedResults = filteredResults.sort((a, b) => b.similarity - a.similarity);

console.log('Closest Matches:', sortedResults);
