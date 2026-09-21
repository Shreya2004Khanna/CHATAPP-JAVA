FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY . .

RUN apt-get update && apt-get install -y nodejs npm

RUN npm install

RUN javac -d out src/server/Server.java

CMD ["sh", "-c", "java -cp out server.Server & node ws-bridge.js"]
