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
import java.util.regex.*;

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
  static final Set<String> PROFILES=Set.of("road","road-quiet","road-paved","road-quiet-paved","gravel","gravel-rural","mtb","mtb-rural","mixed");
  static final Pattern COORDINATE=Pattern.compile("-?\\d+(?:\\.\\d+)?,-?\\d+(?:\\.\\d+)?");
  static final Pattern UNMAPPED_PIN=Pattern.compile("\\b(from|to|via[0-9])-position not mapped\\b");
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
  static boolean engineReady() {
    Process child=engine;
    return ready&&child!=null&&child.isAlive();
  }
  static void stopEngine(Process child) throws IOException,InterruptedException {
    if(child==null)return;
    if(child.isAlive()){
      child.destroyForcibly();
      if(!child.waitFor(5,TimeUnit.SECONDS))throw new IOException("Engine did not stop");
    }
    if(engine==child)engine=null;
  }
  static void startEngine() throws Exception {
    ready=false;
    if(System.currentTimeMillis()-window>300000){window=System.currentTimeMillis();restarts=0;}
    if(restarts++>=3){log("engine_restart_limit");System.exit(75);}
    stopEngine(engine);
    if(Thread.currentThread().isInterrupted())return;
    Process child=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin/java").toString(),"-Xms64m","-Xmx384m","-XX:MaxMetaspaceSize=96m","-XX:MaxDirectMemorySize=32m","-XX:+ExitOnOutOfMemoryError","-DmaxRunningTime=18","-DuseRFCMimeType=true","-cp",ROOT.resolve("brouter.jar").toString(),"btools.server.RouteServer",ROOT.resolve("segments").toString(),ROOT.resolve("profiles").toString(),ROOT.resolve("custom").toString(),"17777","1","127.0.0.1")
      .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
    engine=child;
    try {
      long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(25);
      String warm="lonlats=-0.296178,51.450117%7C-0.29250,51.45250&profile=road&alternativeidx=0&format=geojson";
      URI uri=URI.create("http://127.0.0.1:17777/brouter?"+warm);
      while(child.isAlive()){
        long left=end-System.nanoTime();
        if(left<=0)break;
        try {
          HttpResponse<String> r=CLIENT.send(HttpRequest.newBuilder(uri).timeout(Duration.ofNanos(Math.min(left,TimeUnit.SECONDS.toNanos(4)))).GET().build(),HttpResponse.BodyHandlers.ofString());
          if(r.statusCode()==200&&r.body().contains("LineString")){ready=true;log("engine_ready");return;}
        }catch(IOException ignored){}
        Thread.sleep(200);
      }
      throw new IOException("Engine did not become ready");
    }finally {
      if(!ready)stopEngine(child);
    }
  }
  static byte[] capped(InputStream in,int max) throws IOException {byte[] b=in.readNBytes(max+1);if(b.length>max)throw new IOException("Request too large");return b;}
  static void send(HttpExchange x,int code,String text) throws IOException {
    byte[] b=text.getBytes(StandardCharsets.UTF_8);x.getResponseHeaders().set("Content-Type","application/json; charset=utf-8");x.getResponseHeaders().set("Cache-Control","no-store");x.getResponseHeaders().set("X-Content-Type-Options","nosniff");x.getResponseHeaders().set("X-InFlite-Route-Data",version);x.sendResponseHeaders(code,b.length);x.getResponseBody().write(b);x.close();
  }
  static Map<String,String> form(byte[] bytes) throws Exception {
    Map<String,String> out=new HashMap<>();for(String entry:new String(bytes,StandardCharsets.UTF_8).split("&")){String[] p=entry.split("=",2);if(p.length!=2)throw new IllegalArgumentException();String k=URLDecoder.decode(p[0],StandardCharsets.UTF_8),v=URLDecoder.decode(p[1],StandardCharsets.UTF_8);if(out.put(k,v)!=null)throw new IllegalArgumentException();}return out;
  }
  static int validatePoints(String points,boolean pins) {
    if(points==null)throw new IllegalArgumentException();
    String[] values=points.split("\\|",-1);
    if(values.length<(pins?2:5)||values.length>10)throw new IllegalArgumentException();
    double[] first=null,previous=null;
    for(String value:values){
      if(!COORDINATE.matcher(value).matches())throw new IllegalArgumentException();
      String[] xy=value.split(",");
      double lon=Double.parseDouble(xy[0]),lat=Double.parseDouble(xy[1]);
      if(lon < -16 || lon > 4 || lat < 48 || lat > 63)throw new IllegalArgumentException();
      if(pins && previous!=null && previous[0]==lon && previous[1]==lat)throw new IllegalArgumentException();
      previous=new double[]{lon,lat};
      if(first==null)first=previous;
    }
    if(!pins && (first[0]!=previous[0] || first[1]!=previous[1]))throw new IllegalArgumentException();
    return values.length;
  }
  static String noRoute(byte[] body,int pointCount) {
    Matcher error=UNMAPPED_PIN.matcher(new String(body,StandardCharsets.UTF_8));
    if(error.find()){
      String name=error.group(1);
      int index=switch(name){case "from" -> 0;case "to" -> pointCount-1;default -> Integer.parseInt(name.substring(3));};
      if(index<pointCount)return "{\"error\":\"no_route\",\"pointIndex\":"+index+"}";
    }
    return "{\"error\":\"no_route\"}";
  }
  static void route(HttpExchange x) throws IOException {
    boolean acquired=false;
    try {
      if(!x.getRequestMethod().equals("POST")||!x.getRequestURI().getPath().equals("/route")||x.getRequestURI().getRawQuery()!=null){send(x,404,"{\"error\":\"not_found\"}");return;}
      if(!engineReady()){send(x,503,"{\"error\":\"warming\"}");return;}
      if(!SLOT.tryAcquire()){send(x,503,"{\"error\":\"busy\"}");return;}acquired=true;
      if(!String.valueOf(x.getRequestHeaders().getFirst("Content-Type")).startsWith("application/x-www-form-urlencoded")){send(x,415,"{\"error\":\"content_type\"}");return;}
      Map<String,String> f=form(capped(x.getRequestBody(),4096));String profile=f.get("profile"),points=f.get("lonlats");
      boolean pins="pins".equals(f.get("mode"));
      if(f.size()!=(pins?3:2)||profile==null||!PROFILES.contains(profile))throw new IllegalArgumentException();
      int pointCount=validatePoints(points,pins);
      String q="lonlats="+URLEncoder.encode(points,StandardCharsets.UTF_8)+"&profile="+profile+"&alternativeidx=0&format=geojson";
      // Loop shaping can discard out-and-back detours. Every user-selected stop must be visited.
      if(pins)q+="&profile%3AcorrectMisplacedViaPoints=0";
      HttpResponse<InputStream> r=CLIENT.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:17777/brouter?"+q)).timeout(Duration.ofSeconds(20)).GET().build(),HttpResponse.BodyHandlers.ofInputStream());
      try(InputStream body=r.body()){
        byte[] bytes=capped(body,3*1024*1024);
        if(r.statusCode()==200){completed.incrementAndGet();send(x,200,new String(bytes,StandardCharsets.UTF_8));}
        else {
          failed.incrementAndGet();
          boolean timedOut=pins && new String(bytes,StandardCharsets.UTF_8).contains(" timeout after ");
          if(r.statusCode()>=500 || timedOut)send(x,503,"{\"error\":\"route_unavailable\"}");
          else send(x,422,pins?noRoute(bytes,pointCount):"{\"error\":\"no_route\"}");
        }
      }
    }catch(IllegalArgumentException e){send(x,400,"{\"error\":\"invalid_route\"}");}
    catch(Exception e){failed.incrementAndGet();send(x,503,"{\"error\":\"route_unavailable\"}");}
    finally{if(acquired)SLOT.release();}
  }
  public static void main(String[] args) throws Exception {
    // The container port probe checks reachability, so bind only after the first warmup.
    try{verify();Files.createDirectories(ROOT.resolve("custom"));startEngine();}catch(Exception e){log("startup_failed");System.exit(1);return;}
    HttpServer server=HttpServer.create(new InetSocketAddress("0.0.0.0",8080),16);
    server.createContext("/health",x->{if(!x.getRequestMethod().equals("GET")||!x.getRequestURI().getPath().equals("/health")){send(x,404,"{\"error\":\"not_found\"}");return;}boolean ok=engineReady();send(x,ok?200:503,"{\"ready\":"+ok+",\"pinRouting\":true,\"engine\":\"BRouter-1.7.10\",\"snapshot\":\""+version+"\",\"completed\":"+completed.get()+",\"failed\":"+failed.get()+"}");});
    server.createContext("/route",RouterService::route);server.setExecutor(Executors.newFixedThreadPool(4));server.start();
    ScheduledExecutorService watchdog=Executors.newSingleThreadScheduledExecutor();
    Runtime.getRuntime().addShutdownHook(new Thread(()->{
      ready=false;
      watchdog.shutdownNow();
      server.stop(0);
      Process child=engine;
      if(child!=null)child.destroyForcibly();
    }));
    watchdog.scheduleWithFixedDelay(()->{
      if(!engineReady()){
        try{startEngine();}
        catch(InterruptedException e){Thread.currentThread().interrupt();}
        catch(Exception e){log("engine_restart_failed");}
      }
    },2,2,TimeUnit.SECONDS);
  }
}
