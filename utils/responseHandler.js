const sendResponse = (res, statusCode, message, data = null) => {
  const response = { statusCode, message };

  if (data !== null) {
    response.data = data;
  }

  res.status(statusCode).json(response);
};

module.exports = sendResponse;
