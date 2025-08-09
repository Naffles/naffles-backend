const fastcsv = require("fast-csv");
const { validateCSVHeaders } = require("./fileSettingValidation");

const normalizeHeader = (header) => {
    return header.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
};

const parseCSV = (buffer, settingType) => {
    return new Promise((resolve, reject) => {
        const results = [];
        let headersValidated = false;

        fastcsv.parseString(buffer.toString(), {
                headers: headers => {
                    const normalizedHeaders = headers.map(normalizeHeader);
                    console.log(`normalizedHeaders= ${normalizedHeaders}`);
                    if (!headersValidated) {
                        validateCSVHeaders(normalizedHeaders, settingType);
                        headersValidated = true;
                    }
                    return normalizedHeaders;
                }
            })
            .on('data', (row) => results.push(row))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
};

module.exports = { normalizeHeader, parseCSV };