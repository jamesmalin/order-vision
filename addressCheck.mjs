import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// !! We should be storing the normalized array of addresses from expandparser
async function getParsedAddress(oneLineAddress) {
    try {
        // go rest docker: options: parse
        // rest docker options: parser, expandparser

        const dockerUsed = 'rest'; // go-rest, rest
        const single = false;
        const request = (dockerUsed === 'rest') ? {
            query: oneLineAddress,
            // langs: ['en']
        } : {
            address: oneLineAddress,
            title_case: true
        }; // parser, expandparser

        const response = await axios.post('http://34.219.176.221/expandparser', request, {
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (single && dockerUsed === 'rest') {
            const parsedAddress = (dockerUsed === 'rest')
                ? response.data.find(entry => entry.type === 'expansion')
                : response.data;

            return parsedAddress.data;
        } else {
            return response.data;
        }
    } catch (error) {
        console.error("Error parsing address:", error);
        return null; // Return null if the API call fails
    }
}

const parsedAddress = await getParsedAddress('123 Main, Homegrown, CA, 92591 USA');
console.log(JSON.stringify(parsedAddress, null, 2));