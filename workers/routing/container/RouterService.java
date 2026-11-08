import com.sun.net.httpserver.*;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

// The engine is private, logs no request URLs, and needs no external network at runtime.
public final class RouterService {
  static final Path ROOT=Path.of(System.getenv().getOrDefault("ROUTER_HOME","/opt/router"));
  static final HttpClient CLIENT=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
  static final Semaphore SLOT=new Semaphore(1);
  static volatile Process engine;
  static volatile boolean ready=false;
  static String version;
  static int restarts=0;
  static long window=System.currentTimeMillis();
  static final AtomicLong completed=new AtomicLong(),failed=new AtomicLong();
  static void log(String event){System.err.println("{\"event\":\""+event+"\"}");}
  static void verify() throws Exception {
    for(String row:Files.readAllLines(ROOT.resolve("SHA256SUMS"))){
      String[] pair=row.split("  ",2);Path p=ROOT.resolve(pair[1]).normalize();
      if(!p.startsWith(ROOT))throw new IOException("Invalid asset path");
      MessageDigest sha=MessageDigest.getInstance("SHA-256");
      try(InputStream in=Files.newInputStream(p)){byte[] b=new byte[65536];for(int n;(n=in.read(b))>0;)sha.update(b,0,n);}
      if(!HexFormat.of().formatHex(sha.digest()).equals(pair[0]))throw new IOException("Routing asset verification failed");
    }
    version=Files.readString(ROOT.resolve("version.txt")).trim();
    if(!version.matches("[a-zA-Z0-9-]{1,80}"))throw new IOException("Invalid snapshot version");
  }
  static synchronized void startEngine() throws Exception {
    ready=false;
    if(System.currentTimeMillis()-window>300000){window=System.currentTimeMillis();restarts=0;}
    if(restarts++>=3){log("engine_restart_limit");System.exit(75);}
    if(engine!=null)engine.destroyForcibly();
    engine=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin/java").toString(),"-Xms64m","-Xmx384m","-XX:MaxMetaspaceSize=96m","-XX:MaxDirectMemorySize=32m","-XX:+ExitOnOutOfMemoryError","-DmaxRunningTime=18","-DuseRFCMimeType=true","-cp",ROOT.resolve("brouter.jar").toString(),"btools.server.RouteServer",ROOT.resolve("segments").toString(),ROOT.resolve("profiles").toString(),ROOT.resolve("custom").toString(),"17777","1","127.0.0.1")
      .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
    long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(25);
    String warm="lonlats=-0.296178,51.450117%7C-0.29250,51.45250&profile=road&alternativeidx=0&format=geojson";
    while(System.nanoTime()<end&&engine.isAlive()){
      try {HttpResponse<String> r=CLIENT.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:17777/brouter?"+warm)).timeout(Duration.ofSeconds(4)).GET().build(),HttpResponse.BodyHandlers.ofString());if(r.statusCode()==200&&r.body().contains("LineString")){ready=true;log("engine_ready");return;}}
      catch(Exception ignored){}Thread.sleep(200);
    }
    throw new IOException("Engine did not become ready");
  }
  static byte[] capped(InputStream in,int max) throws IOException {byte[] b=in.readNBytes(max+1);if(b.length>max)throw new IOException("Request too large");return b;}
  static void send(HttpExchange x,int code,String text) throws IOException {
    byte[] b=text.getBytes(StandardCharsets.UTF_8);x.getResponseHeaders().set("Content-Type","application/json; charset=utf-8");x.getResponseHeaders().set("Cache-Control","no-store");x.getResponseHeaders().set("X-Content-Type-Options","nosniff");x.getResponseHeaders().set("X-InFlite-Route-Data",version);x.sendResponseHeaders(code,b.length);x.getResponseBody().write(b);x.close();
  }
  static Map<String,String> form(byte[] bytes) throws Exception {
    Map<String,String> out=new HashMap<>();for(String entry:new String(bytes,StandardCharsets.UTF_8).split("&")){String[] p=entry.split("=",2);if(p.length!=2)throw new IllegalArgumentException();String k=URLDecoder.decode(p[0],StandardCharsets.UTF_8),v=URLDecoder.decode(p[1],StandardCharsets.UTF_8);if(out.put(k,v)!=null)throw new IllegalArgumentException();}return out;
  }
  static void route(HttpExchange x) throws IOException {
    boolean acquired=false;
    try {
      if(!x.getRequestMethod().equals("POST")||!x.getRequestURI().getPath().equals("/route")||x.getRequestURI().getRawQuery()!=null){send(x,404,"{\"error\":\"not_found\"}");return;}
      if(!ready||engine==null||!engine.isAlive()){send(x,503,"{\"error\":\"warming\"}");return;}
      if(!SLOT.tryAcquire()){send(x,503,"{\"error\":\"busy\"}");return;}acquired=true;
      if(!String.valueOf(x.getRequestHeaders().getFirst("Content-Type")).startsWith("application/x-www-form-urlencoded")){send(x,415,"{\"error\":\"content_type\"}");return;}
      Map<String,String> f=form(capped(x.getRequestBody(),4096));String profile=f.get("profile"),points=f.get("lonlats");
      if(f.size()!=2||profile==null||!Set.of("road","road-quiet","road-paved","road-quiet-paved","mixed").contains(profile)||points==null)throw new IllegalArgumentException();
      String[] pts=points.split("\\|");if(pts.length!=5||!pts[0].equals(pts[4]))throw new IllegalArgumentException();
      for(String p:pts){String[] xy=p.split(",");if(xy.length!=2)throw new IllegalArgumentException();double lon=Double.parseDouble(xy[0]),lat=Double.parseDouble(xy[1]);if(!Double.isFinite(lon)||!Double.isFinite(lat)||lon< -16||lon>4||lat<48||lat>63)throw new IllegalArgumentException();}
      String q="lonlats="+URLEncoder.encode(points,StandardCharsets.UTF_8)+"&profile="+profile+"&alternativeidx=0&format=geojson";
      HttpResponse<InputStream> r=CLIENT.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:17777/brouter?"+q)).timeout(Duration.ofSeconds(20)).GET().build(),HttpResponse.BodyHandlers.ofInputStream());
      try(InputStream body=r.body()){
        byte[] bytes=capped(body,3*1024*1024);
        if(r.statusCode()==200){completed.incrementAndGet();send(x,200,new String(bytes,StandardCharsets.UTF_8));}
        else {failed.incrementAndGet();send(x,r.statusCode()>=500?503:422,"{\"error\":\"no_route\"}");}
      }
    }catch(IllegalArgumentException e){send(x,400,"{\"error\":\"invalid_route\"}");}
    catch(Exception e){failed.incrementAndGet();send(x,503,"{\"error\":\"route_unavailable\"}");}
    finally{if(acquired)SLOT.release();}
  }
  public static void main(String[] args) throws Exception {
    try{verify();Files.createDirectories(ROOT.resolve("custom"));startEngine();}catch(Exception e){log("startup_failed");System.exit(1);return;}
    HttpServer server=HttpServer.create(new InetSocketAddress("0.0.0.0",8080),16);
    server.createContext("/health",x->{if(!x.getRequestMethod().equals("GET")||!x.getRequestURI().getPath().equals("/health")){send(x,404,"{\"error\":\"not_found\"}");return;}boolean ok=ready&&engine!=null&&engine.isAlive();send(x,ok?200:503,"{\"ready\":"+ok+",\"engine\":\"BRouter-1.7.10\",\"snapshot\":\""+version+"\",\"completed\":"+completed.get()+",\"failed\":"+failed.get()+"}");});
    server.createContext("/route",RouterService::route);server.setExecutor(Executors.newFixedThreadPool(4));server.start();
    Executors.newSingleThreadScheduledExecutor().scheduleWithFixedDelay(()->{if(engine==null||!engine.isAlive()){ready=false;try{startEngine();}catch(Exception e){log("engine_restart_failed");}}},2,2,TimeUnit.SECONDS);
    Runtime.getRuntime().addShutdownHook(new Thread(()->{ready=false;server.stop(0);if(engine!=null)engine.destroyForcibly();}));
  }
}
