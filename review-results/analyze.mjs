import fs from 'fs/promises';
import path from 'path';

function analyzeFile(data, filename) {
  const metrics = {
    filename,
    totalOrders: data.files.length,
    transferTypes: {
      'Automatic Transfer': 0,
      'Manual Transfer': 0,
      'Other': 0
    },
    confidenceScores: {
      total: 0,
      count: 0
    },
    salesOrgs: {},
    currencies: {},
    lineItemsPerOrder: {
      total: 0,
      min: Infinity,
      max: -Infinity
    }
  };

  for (const order of data.files) {
    // Transfer type analysis
    const transferType = order.header['Creation Status'] || 'Other';
    metrics.transferTypes[transferType] = (metrics.transferTypes[transferType] || 0) + 1;

    // Confidence score analysis
    if (order.header['Confidance Score']) {
      metrics.confidenceScores.total += parseFloat(order.header['Confidance Score']);
      metrics.confidenceScores.count++;
    }

    // Sales organization analysis
    const salesOrg = order.header['Sales Organization'] || 'Unknown';
    metrics.salesOrgs[salesOrg] = (metrics.salesOrgs[salesOrg] || 0) + 1;

    // Line items analysis
    const lineItemCount = order.line_items?.length || 0;
    metrics.lineItemsPerOrder.total += lineItemCount;
    metrics.lineItemsPerOrder.min = Math.min(metrics.lineItemsPerOrder.min, lineItemCount);
    metrics.lineItemsPerOrder.max = Math.max(metrics.lineItemsPerOrder.max, lineItemCount);

    // Currency analysis
    if (order.line_items && order.line_items.length > 0) {
      const currency = order.line_items[0].WAERK || 'Unknown';
      metrics.currencies[currency] = (metrics.currencies[currency] || 0) + 1;
    }
  }

  return {
    filename: metrics.filename,
    totalOrders: metrics.totalOrders,
    transferTypes: {
      ...metrics.transferTypes,
      percentages: {
        automaticTransfer: ((metrics.transferTypes['Automatic Transfer'] || 0) / metrics.totalOrders * 100).toFixed(2) + '%',
        manualTransfer: ((metrics.transferTypes['Manual Transfer'] || 0) / metrics.totalOrders * 100).toFixed(2) + '%',
        other: ((metrics.transferTypes['Other'] || 0) / metrics.totalOrders * 100).toFixed(2) + '%'
      }
    },
    averageConfidenceScore: metrics.confidenceScores.count > 0 
      ? (metrics.confidenceScores.total / metrics.confidenceScores.count).toFixed(2)
      : 'N/A',
    salesOrganizationDistribution: metrics.salesOrgs,
    lineItems: {
      average: (metrics.lineItemsPerOrder.total / metrics.totalOrders).toFixed(2),
      min: metrics.lineItemsPerOrder.min === Infinity ? 0 : metrics.lineItemsPerOrder.min,
      max: metrics.lineItemsPerOrder.max === -Infinity ? 0 : metrics.lineItemsPerOrder.max
    },
    currencyDistribution: metrics.currencies
  };
}

async function analyzeResults() {
  const resultsDir = './results';
  const files = await fs.readdir(resultsDir);
  const jsonFiles = files.filter(file => file.endsWith('.json'));

  const allResults = [];
  
  for (const file of jsonFiles) {
    const content = await fs.readFile(path.join(resultsDir, file), 'utf8');
    const data = JSON.parse(content);
    const fileResults = analyzeFile(data, file);
    allResults.push(fileResults);
  }

  console.log('Analysis Results Per File:');
  console.log(JSON.stringify(allResults, null, 2));

  // Print summary of automatic transfers across files
  console.log('\nAutomatic Transfer Summary:');
  for (const result of allResults) {
    const autoTransfers = result.transferTypes['Automatic Transfer'] || 0;
    const percentage = result.transferTypes.percentages.automaticTransfer;
    console.log(`${result.filename}: ${autoTransfers} orders (${percentage})`);
  }
}

analyzeResults().catch(console.error);
