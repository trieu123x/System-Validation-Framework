# syntax=docker/dockerfile:1
# Một image dùng chung cho server.jar, client.jar và loadsim.jar (chọn bằng lệnh: server | client | loadsim).

# ---- 1. Giao diện Next.js → HTML tĩnh ui/out ----
FROM node:22-alpine AS ui
WORKDIR /ui
ENV NEXT_TELEMETRY_DISABLED=1
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ui/ ./
RUN npm run build

# ---- 2. Bốn module Java ----
FROM maven:3.9.9-eclipse-temurin-17 AS jars
WORKDIR /src
COPY pom.xml ./
COPY common/ common/
COPY server/ server/
COPY client/ client/
COPY loadsim/ loadsim/
# test chạy riêng bằng scripts\build.bat; ở đây chỉ đóng gói
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -DskipTests package

# ---- 3. Image chạy ----
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=jars /src/server/target/server.jar /src/client/target/client.jar /src/loadsim/target/loadsim.jar ./
COPY --from=ui /ui/out ui/out
COPY config/server.properties config/client.properties config/
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
# file có thể mang CRLF khi checkout trên Windows
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh
ENV JAVA_OPTS="-Djava.awt.headless=true"
EXPOSE 5000 5001/udp 8080 8081
ENTRYPOINT ["entrypoint.sh"]
CMD ["server"]
