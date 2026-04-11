FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Expose Web Server port
EXPOSE 8080

# Start server
CMD ["npm", "start"]
