FROM eclipse-temurin:21-jdk-jammy@sha256:4b1a74fbffbe6b4e7b6f0171a472478282fb463790a51edf10e465d578f22b69 AS compile
WORKDIR /src
COPY container/*.java ./
RUN javac --release 17 -d /classes *.java

FROM scratch AS classes
COPY --from=compile /classes /

FROM eclipse-temurin:21-jre-jammy@sha256:1eac8b8fee11ca7d6725a48bc5d41992ed1561504ebae25490d2d062847e8269
WORKDIR /opt/router
COPY NOTICE.txt LICENSE-BROUTER.txt ./
COPY --from=compile /classes /opt/router/classes
COPY --chown=10001:10001 .build/brouter.jar .build/SHA256SUMS .build/version.txt ./
COPY --chown=10001:10001 .build/profiles ./profiles
COPY --chown=10001:10001 .build/segments ./segments
RUN mkdir custom && chown 10001:10001 custom
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-Xms16m", "-Xmx64m", "-XX:MaxMetaspaceSize=64m", "-XX:MaxDirectMemorySize=16m", "-cp", "/opt/router/classes", "RouterService"]
