FROM apify/actor-node-playwright-chrome:latest

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . ./

# Set environment variables
ENV NODE_ENV=production

# Run the actor
CMD ["node", "main.js"]

