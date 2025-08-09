const parseFormData = (req, res, next) => {
	try {
		const parsedData = {};

		// Function to set nested keys and handle arrays
		const setNestedValue = (obj, path, value) => {
			const keys = path.replace(/\[(\d*)\]/g, ".$1").split(".");
			let current = obj;

			keys.forEach((key, index) => {
				// Check if this key is an array indicator (e.g. accountsToFollow[])
				const isArray = key === "";

				if (isArray) {
					key = keys[index - 1];
					if (!Array.isArray(current[key])) {
						current[key] = [];
					}
					current[key].push(value);
				} else if (index === keys.length - 1) {
					// Final key, assign value
					if (Array.isArray(current[key])) {
						current[key].push(value);
					} else if (current[key] !== undefined) {
						// If the key already exists and is not an array, make it an array
						current[key] = [current[key], value];
					} else {
						// Otherwise, just assign the value
						current[key] = value;
					}
				} else {
					// Intermediate key, create object or array as needed;
					if (!current[key]) {
						// Check if the next key is an array notation (e.g., accountsToFollow[])
						current[key] = isNaN(keys[index + 1]) ? {} : [];
					}
					current = current[key];
				}
			});
		};

		// Iterate over each field in req.body and parse nested fields
		for (const [key, value] of Object.entries(req.body)) {
			setNestedValue(parsedData, key, value);
		}

		req.body = parsedData;
		// console.log("parsedData:", parsedData);
		next();
	} catch (err) {
		console.log("error encountered:", err);
	}
};

// Funtion to serialize FormData to integrate with backend API
const buildFormData = (formData, data, parentKey = "") => {
	if (data && typeof data === "object" && !Array.isArray(data)) {
		Object.keys(data).forEach((key) => {
			buildFormData(
				formData,
				data[key],
				parentKey ? `${parentKey}.${key}` : key,
			);
		});
	} else if (Array.isArray(data)) {
		data.forEach((value) => {
			formData.append(`${parentKey}[]`, value);
		});
	} else {
		formData.append(parentKey, data);
	}
};

module.exports = parseFormData;
