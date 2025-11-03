import { checkKNVP } from './knvp-check.mjs';

// Define the value to check
const value = '2120995';

// Check the value in knvp.json
const matches = checkKNVP(value);

// Output the matches
// if (matches) {
//   console.log(`Matches for ${value}:`);
//   for (const match of matches) {
//     console.log(`- ${match.customer}`);
//   }
// }

// Output the matches
const filteredMatches = matches.filter(match => match.customer.toString().startsWith('1'));

if (filteredMatches.length === 1) {
  console.log(`Match for ${value}: ${filteredMatches[0].customer}`);
} else {
  console.log(false);
}