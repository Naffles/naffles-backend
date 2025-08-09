# Use an official Node.js runtime as a parent image
FROM node:18

# Install necessary dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm-dev \
    libpangocairo-1.0-0 \
    libxshmfence1 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./

ARG NODE_ENV
RUN if [ "$NODE_ENV" = "production" ]; \
        then npm install --only=production; \
        else npm install; \
        fi

# Copy the rest of your application code
COPY . ./

# Set environment variables
ENV PORT 4000

# Expose the port
EXPOSE $PORT

# Run the application
CMD ["node", "index.js"]
