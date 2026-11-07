import java.net.URI;
import java.net.http.*;
import java.time.Duration;
public class Probe {
  public static void main(String[] args) throws Exception {
    var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    for(int i=0;;i++){
      try{var r=client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:8080/health")).timeout(Duration.ofSeconds(4)).GET().build(),HttpResponse.BodyHandlers.ofString());if(r.statusCode()==200&&r.body().contains("\"ready\":true")){System.out.println(r.body());break;}}catch(Exception ignored){}
      if(i>=45)throw new Exception("Routing container did not become ready");Thread.sleep(1000);
    }
    String form="profile=road&lonlats=-0.296178,51.450117%7C-0.290178,51.453117%7C-0.290178,51.456117%7C-0.299178,51.453117%7C-0.296178,51.450117";
    var r=client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:8080/route")).timeout(Duration.ofSeconds(30)).header("Content-Type","application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(form)).build(),HttpResponse.BodyHandlers.ofString());
    if(r.statusCode()!=200||!r.body().contains("LineString"))throw new Exception("Offline routing container probe failed");System.out.println("PASS: route computed with external networking disabled");
  }
}
