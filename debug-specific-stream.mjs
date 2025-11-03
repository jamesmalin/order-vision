#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const LOG_GROUP = '/aws/lambda/order-vision-start-processing';
const PROFILE = 'bio-rad-prod';
const STREAM_NAME = '2025/08/04/[$LATEST]afeddcbeab1c40ce911ecb7dbb37ea79';

async function debugStream() {
    try {
        console.log(`🔍 Debugging stream: ${STREAM_NAME}`);
        
        // Get log events from this stream
        const escapedStreamName = STREAM_NAME.replace(/\$/g, '\\$');
        let getEventsCommand = `aws logs get-log-events --log-group-name "${LOG_GROUP}" --log-stream-name "${escapedStreamName}" --profile ${PROFILE} --limit 10000`;
        
        console.log('📋 Getting events with default method...');
        let { stdout: eventsOutput } = await execAsync(getEventsCommand, { maxBuffer: 1024 * 1024 * 10 });
        let eventsData = JSON.parse(eventsOutput);
        
        if (!eventsData.events || eventsData.events.length === 0) {
            console.log('⚠️  No events with default method, trying --start-from-head...');
            getEventsCommand = `aws logs get-log-events --log-group-name "${LOG_GROUP}" --log-stream-name "${escapedStreamName}" --profile ${PROFILE} --start-from-head --limit 10000`;
            const { stdout: headEventsOutput } = await execAsync(getEventsCommand, { maxBuffer: 1024 * 1024 * 10 });
            eventsData = JSON.parse(headEventsOutput);
        }
        
        console.log(`✅ Found ${eventsData.events.length} events`);
        
        // Look for RRC-related entries and other patterns
        let rrcCount = 0;
        let fullResultCount = 0;
        let otherPatterns = 0;
        
        for (let i = 0; i < eventsData.events.length; i++) {
            const event = eventsData.events[i];
            const message = event.message;
            const lowerMessage = message.toLowerCase();
            
            // Check for RRC patterns (case insensitive)
            if (lowerMessage.includes('rrc number') || lowerMessage.includes('rrc numbers') || 
                lowerMessage.includes('no rrc number') || lowerMessage.includes('no rrc numbers') ||
                lowerMessage.includes('rrc') || message.includes('RRC')) {
                rrcCount++;
                console.log(`\n🎯 Found RRC-related entry #${rrcCount}:`);
                console.log(`Index: ${i}`);
                console.log(`Message: ${message.substring(0, 300)}...`);
            }
            
            // Check for Full result patterns (case insensitive)
            if (lowerMessage.includes('full result') || lowerMessage.includes('result:')) {
                fullResultCount++;
                console.log(`\n📄 Found result entry #${fullResultCount}:`);
                console.log(`Index: ${i}`);
                console.log(`Message: ${message.substring(0, 300)}...`);
            }
            
            // Check for other interesting patterns
            if (lowerMessage.includes('1096570') || lowerMessage.includes('undefined') || 
                lowerMessage.includes('json') || lowerMessage.includes('{')) {
                otherPatterns++;
                if (otherPatterns <= 5) { // Only show first 5
                    console.log(`\n🔍 Found interesting pattern #${otherPatterns}:`);
                    console.log(`Index: ${i}`);
                    console.log(`Message: ${message.substring(0, 300)}...`);
                }
            }
        }
        
        console.log(`\n📊 Summary:`);
        console.log(`   - Total events: ${eventsData.events.length}`);
        console.log(`   - RRC entries: ${rrcCount}`);
        console.log(`   - Full result entries: ${fullResultCount}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

debugStream();
