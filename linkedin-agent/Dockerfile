FROM apify/actor-node:20

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source code
COPY . ./

# Set environment variables
ENV NODE_ENV=production

# Run the actor
CMD ["node", "main.js"]
