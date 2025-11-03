#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const LOG_GROUP = '/aws/lambda/order-vision-start-processing';
const PROFILE = 'bio-rad-prod';
const DEFAULT_STREAM_LIMIT = 10;

function printUsage() {
    console.log(`
Usage: node search-prod-logs.mjs <search_term> [options]

Arguments:
  search_term          The value to search for in the JSON data

Options:
  --streams <number>   Number of recent log streams to search (default: ${DEFAULT_STREAM_LIMIT})
  --help              Show this help message

Examples:
  node search-prod-logs.mjs 13450263953
  node search-prod-logs.mjs 1096570 --streams 20
  node search-prod-logs.mjs "广州市瀚达贸易有限公司"
  node search-prod-logs.mjs "001265VC"
`);
}

async function searchProductionLogs(searchTerm, streamLimit = DEFAULT_STREAM_LIMIT) {
    try {
        console.log(`🔍 Searching for "${searchTerm}" in the last ${streamLimit} log streams...`);
        console.log(`📊 Log Group: ${LOG_GROUP}`);
        console.log(`🔧 Profile: ${PROFILE}\n`);
        
        // Get recent log streams
        const listStreamsCommand = `aws logs describe-log-streams --log-group-name "${LOG_GROUP}" --profile ${PROFILE} --order-by LastEventTime --descending --max-items ${streamLimit}`;
        
        console.log('📋 Getting recent log streams...');
        const { stdout: streamsOutput } = await execAsync(listStreamsCommand);
        const streamsData = JSON.parse(streamsOutput);
        
        if (!streamsData.logStreams || streamsData.logStreams.length === 0) {
            console.log('❌ No log streams found');
            return;
        }
        
        console.log(`✅ Found ${streamsData.logStreams.length} log streams to search\n`);
        
        let totalFullResults = 0;
        let streamsSearched = 0;
        
        // Search through each stream
        for (let i = 0; i < streamsData.logStreams.length; i++) {
            const stream = streamsData.logStreams[i];
            streamsSearched++;
            
            console.log(`🔎 [${streamsSearched}/${streamsData.logStreams.length}] Searching stream: ${stream.logStreamName}`);
            
            try {
                // Add a small delay to avoid rate limiting
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
                }
                
                // Get log events from this stream - escape special characters in stream name
                const escapedStreamName = stream.logStreamName.replace(/\$/g, '\\$');
                let getEventsCommand = `aws logs get-log-events --log-group-name "${LOG_GROUP}" --log-stream-name "${escapedStreamName}" --profile ${PROFILE} --limit 10000`;
                
                let { stdout: eventsOutput } = await execAsync(getEventsCommand, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer
                let eventsData = JSON.parse(eventsOutput);
                
                // If no events found with default method, try --start-from-head with limit
                if (!eventsData.events || eventsData.events.length === 0) {
                    getEventsCommand = `aws logs get-log-events --log-group-name "${LOG_GROUP}" --log-stream-name "${escapedStreamName}" --profile ${PROFILE} --start-from-head --limit 10000`;
                    const { stdout: headEventsOutput } = await execAsync(getEventsCommand, { maxBuffer: 1024 * 1024 * 10 });
                    eventsData = JSON.parse(headEventsOutput);
                    
                    if (!eventsData.events || eventsData.events.length === 0) {
                        console.log('   ⚠️  No events in this stream');
                        continue;
                    }
                }
                
                // Look for entries that come BEFORE "RRC numbers found" or "RRC number found"
                let streamFullResults = 0;
                
                for (let j = 0; j < eventsData.events.length; j++) {
                    const event = eventsData.events[j];
                    const message = event.message;
                    
                    // Check if this is an RRC-related entry or result entry
                    if (message.includes('RRC numbers found') || message.includes('RRC number found') ||
                        message.includes('No RRC numbers found') || message.includes('No RRC number found') ||
                        message.includes('full resultLayout') || message.includes('full resultInvoice')) {
                        streamFullResults++;
                        totalFullResults++;
                        
                        // Look for the previous event that contains JSON data
                        for (let k = j - 1; k >= 0; k--) {
                            const prevEvent = eventsData.events[k];
                            const prevMessage = prevEvent.message;
                            
                            // Look for log entries that contain JSON data
                            if (prevMessage.includes('INFO') && 
                                (prevMessage.includes('{') || prevMessage.includes('['))) {
                                
                                // Extract the JSON part from the log message
                                const logParts = prevMessage.split('\tINFO\t');
                                if (logParts.length >= 2) {
                                    const jsonPart = logParts[logParts.length - 1].trim();
                                    
                                    // Check if our search term exists in this JSON data
                                    if (jsonPart.includes(searchTerm)) {
                                        console.log('\n🎯 MATCH FOUND! 🎯');
                                        console.log(`📅 Timestamp: ${new Date(prevEvent.timestamp).toISOString()}`);
                                        console.log(`🆔 Request ID: ${prevMessage.split('\t')[1]}`);
                                        console.log(`📍 Stream: ${stream.logStreamName}`);
                                        console.log('\n📄 JSON Data:');
                                        console.log('=' .repeat(80));
                                        
                                        try {
                                            // Try to parse and pretty-print the JSON
                                            const parsedJson = JSON.parse(jsonPart);
                                            console.log(JSON.stringify(parsedJson, null, 2));
                                        } catch (parseError) {
                                            // If parsing fails, show the raw data
                                            console.log(jsonPart);
                                        }
                                        
                                        console.log('=' .repeat(80));
                                        console.log(`\n✅ Search completed successfully!`);
                                        console.log(`📊 Statistics:`);
                                        console.log(`   - Streams searched: ${streamsSearched}/${streamsData.logStreams.length}`);
                                        console.log(`   - Total JSON entries found: ${totalFullResults}`);
                                        return;
                                    }
                                }
                                break; // Found the JSON data for this RRC entry, move to next
                            }
                        }
                    }
                }
                
                if (streamFullResults > 0) {
                    console.log(`   ✅ Found ${streamFullResults} RRC entries (no matches)`);
                } else {
                    console.log('   ⚠️  No RRC entries found');
                }
                
            } catch (streamError) {
                console.error(`   ❌ Error reading stream: ${streamError.message}`);
            }
        }
        
        console.log(`\n❌ Search completed - No matches found`);
        console.log(`📊 Final Statistics:`);
        console.log(`   - Streams searched: ${streamsSearched}`);
        console.log(`   - Total "Full result:" entries found: ${totalFullResults}`);
        console.log(`   - Search term: "${searchTerm}"`);
        console.log(`\n💡 Suggestions:`);
        console.log(`   - Try increasing the number of streams with --streams <number>`);
        console.log(`   - Check if the search term is spelled correctly`);
        console.log(`   - The data might be in older logs beyond the current search range`);
        
    } catch (error) {
        console.error('💥 Error searching logs:', error.message);
        
        if (error.message.includes('Unable to locate credentials')) {
            console.log('\n🔧 Please ensure AWS CLI is configured with the bio-rad-prod profile:');
            console.log('   aws configure --profile bio-rad-prod');
        }
        
        if (error.message.includes('does not exist')) {
            console.log('\n🔧 Please check that the log group exists and you have access:');
            console.log(`   aws logs describe-log-groups --profile ${PROFILE} | grep ${LOG_GROUP}`);
        }
    }
}

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.includes('--help')) {
        printUsage();
        process.exit(0);
    }
    
    const searchTerm = args[0];
    let streamLimit = DEFAULT_STREAM_LIMIT;
    
    // Parse options
    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--streams' && i + 1 < args.length) {
            streamLimit = parseInt(args[i + 1]);
            if (isNaN(streamLimit) || streamLimit < 1) {
                console.error('❌ Error: --streams must be a positive number');
                process.exit(1);
            }
            i++; // Skip the next argument as it's the value for --streams
        }
    }
    
    return { searchTerm, streamLimit };
}

// Main execution
const { searchTerm, streamLimit } = parseArgs();
searchProductionLogs(searchTerm, streamLimit);
