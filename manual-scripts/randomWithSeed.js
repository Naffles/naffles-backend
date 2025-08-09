const seedrandom = require("seedrandom");

/**
 * Generates an array of unique random numbers based on a seed using a partial Fisher-Yates shuffle.
 *
 * @param {string} seed - The seed value for the random number generator.
 * @param {number} count - The number of unique random numbers to generate.
 * @param {number} min - The minimum value of the random number range (inclusive).
 * @param {number} max - The maximum value of the random number range (inclusive).
 * @returns {number[]} - An array of unique random numbers.
 * @throws {Error} - If the range is too small to generate the required number of unique numbers.
 */
function generateUniqueNumber(seed, count, min, max) {
	const range = max - min + 1;
	if (range < count) {
		throw new Error("Range is too small to generate the required number of unique numbers.");
	}

	const rng = seedrandom(seed);
	const selectedNumbers = [];
	const map = {}; // To keep track of swapped elements

	for (let i = 0; i < count; i++) {
		// Generate a random index between i and range - 1
		const j = i + Math.floor(rng() * (range - i));

		// Retrieve the actual values at indices i and j, accounting for previous swaps
		const valAtJ = map[j] !== undefined ? map[j] : j;
		const valAtI = map[i] !== undefined ? map[i] : i;

		// Perform the swap in the map
		map[j] = valAtI;
		map[i] = valAtJ;

		// Add the selected number to the result, adjusted by min
		selectedNumbers.push(valAtJ + min);
	}

	return selectedNumbers;
}

// // Example Usage:
// const seed = "80669024213267349807361622597574458857020027144888386712866688992143185110664";
// const count = 5;       // Number of unique random numbers to generate
// const min = 1;         // Minimum value in the range
// const max = 10;        // Maximum value in the range

// const uniqueRandomNumbersArray = generateUniqueNumber(seed, count, min, max);
// console.log(uniqueRandomNumbersArray); // Example Output: [1, 3, 4, 9, 10]