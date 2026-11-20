import btools.codec.DataBuffers;
import btools.codec.TagValueValidator;
import btools.codec.WaypointMatcher;
import btools.expressions.BExpressionContextWay;
import btools.expressions.BExpressionMetaData;
import btools.mapaccess.OsmFile;
import btools.mapaccess.PhysicalFile;
import btools.util.ByteArrayUnifier;
import btools.util.CheapRuler;

import java.io.BufferedOutputStream;
import java.io.DataOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Pattern;

// Read the same RD5 ways and profiles used by the engine. Group connected
// ways of the same type into stretches with checkpoints along their geometry.
public final class BuildCorridors implements TagValueValidator, WaypointMatcher {
  private static final int CELL_SIZE = 50_000;
  private static final int CELL_LIMIT = 4;
  private static final int MAX_STRETCH = 5_500;
  private static final int[] MIN_STRETCH = {420, 260, 220};
  private static final String[] PROFILES = {"road-quiet-paved", "gravel", "mtb"};
  private static final Set<String> PUBLIC_ROAD = Set.of("residential", "living_street", "unclassified", "tertiary", "secondary", "primary");
  private static final Set<String> LOW_TRAFFIC = Set.of("residential", "living_street", "unclassified");
  private static final Set<String> PATH = Set.of("track", "path", "bridleway", "cycleway", "footway");
  private static final Set<String> BIKE_ALLOWED = Set.of("yes", "designated", "permissive");
  private static final Set<String> RESTRICTED = Set.of("no", "private", "destination", "customers", "agricultural", "permit", "military", "delivery", "unknown");
  private static final Set<String> SOFT = Set.of("unpaved", "gravel", "fine_gravel", "compacted", "pebblestone", "ground", "dirt", "earth", "grass", "mud", "sand", "rock", "stone", "clay", "grass_paver");
  private static final Set<String> TRAIL_GRADE = Set.of("0", "0+", "0-", "1", "1+", "1-", "2", "2+", "2-");
  private static final Pattern TILE = Pattern.compile("([EW])(\\d+)_([NS])(\\d+)\\.rd5");

  private final BExpressionContextWay[] profiles = new BExpressionContextWay[3];
  private final int[] gravelFlags, mountainFlags, pavedFlags;
  private final BExpressionMetaData metadata;
  private final ByteArrayUnifier unifier = new ByteArrayUnifier(8192, false);
  private final Map<byte[], Integer> eligibility = new IdentityHashMap<>();
  private final List<Edge> edges = new ArrayList<>();
  private final List<NavigableMap<Integer, List<Corridor>>> cells = List.of(new TreeMap<>(), new TreeMap<>(), new TreeMap<>());
  private long[] geometry = new long[32];
  private long endpoint;
  private int geometrySize, modes;

  private BuildCorridors(Path root) {
    BExpressionMetaData meta = null;
    for (int i = 0; i < profiles.length; i++) {
      meta = new BExpressionMetaData();
      var profile = new BExpressionContextWay(8192, meta);
      meta.readMetaData(root.resolve("profiles/lookups.dat").toFile());
      profile.parseFile(root.resolve("profiles/" + PROFILES[i] + ".brf").toFile(), "global");
      profiles[i] = profile;
    }
    metadata = meta;
    gravelFlags = outputs(profiles[1], "usable_gravel", "difficult_gravel");
    mountainFlags = outputs(profiles[2], "difficult_mountain");
    pavedFlags = outputs(profiles[0], "ispaved", "isunpaved");
  }

  private static int[] outputs(BExpressionContextWay profile, String... names) {
    return Arrays.stream(names).mapToInt(name -> profile.getOutputVariableIndex(name, true)).toArray();
  }

  private int classify(byte[] values) {
    var list = profiles[0].getKeyValueList(false, values);
    var tags = new HashMap<String, String>();
    for (int i = 0; i < list.size(); i += 2) tags.put(list.get(i), list.get(i + 1));
    String highway = tags.getOrDefault("highway", ""), bicycle = tags.getOrDefault("bicycle", "");
    boolean explicit = BIKE_ALLOWED.contains(bicycle) || bicycle.equals("mtb");
    boolean cycleRoute = "yes".equals(tags.get("route_bicycle_lcn")) || "yes".equals(tags.get("route_bicycle_rcn")) ||
      "yes".equals(tags.get("route_bicycle_ncn")) || "yes".equals(tags.get("route_bicycle_icn"));
    if (!explicit && (RESTRICTED.contains(tags.getOrDefault("access", "")) || RESTRICTED.contains(tags.getOrDefault("vehicle", "")))) return 0;
    boolean cycleWay = explicit || cycleRoute || highway.equals("bridleway") || highway.equals("cycleway") ||
      highway.equals("track") && BIKE_ALLOWED.contains(tags.getOrDefault("access", ""));
    int allowed = 0;
    var road = profiles[0];
    road.evaluate(false, values);
    String traffic = tags.getOrDefault("estimated_traffic_class", "");
    boolean quiet = LOW_TRAFFIC.contains(highway) && !Set.of("4", "5", "6", "7").contains(traffic) ||
      highway.equals("tertiary") && Set.of("1", "2").contains(traffic);
    if ((quiet || highway.equals("cycleway") && road.getBuildInVariable(pavedFlags[0]) > 0) && road.getBuildInVariable(pavedFlags[1]) == 0) {
      allowed |= directions(road, values, 1);
    }
    if (cycleWay || PUBLIC_ROAD.contains(highway)) {
      var gravel = profiles[1];
      gravel.evaluate(false, values);
      if (gravel.getBuildInVariable(gravelFlags[0]) > 0 && gravel.getBuildInVariable(gravelFlags[1]) == 0) {
        allowed |= directions(gravel, values, 2);
      }
    }
    if (cycleWay && PATH.contains(highway) && road.getBuildInVariable(pavedFlags[0]) == 0) {
      String surface = tags.getOrDefault("surface", ""), grade = tags.getOrDefault("tracktype", "");
      if (SOFT.contains(surface) || Set.of("grade2", "grade3", "grade4", "grade5").contains(grade) ||
          TRAIL_GRADE.contains(tags.getOrDefault("mtb:scale", ""))) {
        var mountain = profiles[2];
        mountain.evaluate(false, values);
        if (mountain.getBuildInVariable(mountainFlags[0]) == 0) allowed |= directions(mountain, values, 4);
      }
    }
    return allowed;
  }

  private static int directions(BExpressionContextWay profile, byte[] tags, int bit) {
    profile.evaluate(false, tags);
    int forward = profile.getCostfactor() < 9999 ? bit : 0;
    profile.evaluate(true, tags);
    return forward | (profile.getCostfactor() < 9999 ? bit << 3 : 0);
  }

  @Override public boolean isLookupIdxUsed(int index) { return true; }
  @Override public void setDecodeForbidden(boolean ignored) { }
  @Override public byte[] unify(byte[] bytes, int offset, int length) { return unifier.unify(bytes, offset, length); }
  @Override public int accessType(byte[] tags) { return eligibility.computeIfAbsent(tags, this::classify) == 0 ? 0 : 2; }
  @Override public boolean checkStartWay(byte[] tags) { modes = eligibility.get(tags); return true; }
  @Override public boolean hasMatch(int lon, int lat) { return false; }

  @Override public boolean start(int lon, int lat, int targetLon, int targetLat, boolean ignored) {
    long start = point(lon, lat);
    endpoint = point(targetLon, targetLat);
    if (start == endpoint) return false;
    geometrySize = 0;
    append(start);
    return true;
  }

  @Override public void transferNode(int lon, int lat) { append(point(lon, lat)); }

  @Override public void end() {
    append(endpoint);
    edges.add(new Edge(Arrays.copyOf(geometry, geometrySize), modes));
  }

  private void append(long point) {
    if (geometrySize == geometry.length) geometry = Arrays.copyOf(geometry, geometrySize * 2);
    if (geometrySize == 0 || geometry[geometrySize - 1] != point) geometry[geometrySize++] = point;
  }

  private static long point(int lon, int lat) { return ((long) lon << 32) | (lat & 0xffffffffL); }
  private static int lon(long point) { return (int) (point >> 32); }
  private static int lat(long point) { return (int) point; }
  private static double length(long a, long b) { return CheapRuler.distance(lon(a), lat(a), lon(b), lat(b)); }

  private record Edge(long[] points, int modes) {
    long first() { return points[0]; }
    long last() { return points[points.length - 1]; }
    int directions(int mode, long from) {
      int forward = (modes >> mode) & 1, reverse = (modes >> (mode + 3)) & 1;
      return from == first() ? forward | reverse << 1 : reverse | forward << 1;
    }
  }

  private record Corridor(long start, long middle, long finish, int metres, int directions) { }

  private void collect(int mode) {
    Map<Long, List<Edge>> graph = new LinkedHashMap<>();
    for (var edge : edges) {
      if (edge.directions(mode, edge.first()) == 0) continue;
      graph.computeIfAbsent(edge.first(), key -> new ArrayList<>(2)).add(edge);
      graph.computeIfAbsent(edge.last(), key -> new ArrayList<>(2)).add(edge);
    }
    Set<Edge> seen = Collections.newSetFromMap(new IdentityHashMap<>());
    for (var vertex : graph.entrySet()) {
      if (vertex.getValue().size() == 2) continue;
      for (Edge edge : vertex.getValue()) collectChain(graph, seen, mode, vertex.getKey(), edge);
    }
    // A closed ring has no endpoint. The chunk bounds still give it usable legs.
    for (Edge edge : edges) {
      if (edge.directions(mode, edge.first()) != 0) collectChain(graph, seen, mode, edge.first(), edge);
    }
  }

  private void collectChain(Map<Long, List<Edge>> graph, Set<Edge> seen, int mode, long from, Edge edge) {
    if (seen.contains(edge)) return;
    List<Long> points = new ArrayList<>();
    points.add(from);
    int directions = 3;
    double metres = 0;
    while (edge != null && !seen.contains(edge)) {
      int available = directions & edge.directions(mode, from);
      if (available == 0) break;
      seen.add(edge);
      directions = available;
      boolean forward = from == edge.first();
      var shape = edge.points;
      for (int step = 1; step < shape.length; step++) {
        long point = shape[forward ? step : shape.length - 1 - step];
        metres += length(points.get(points.size() - 1), point);
        points.add(point);
        if (metres >= MAX_STRETCH) {
          retain(mode, points, metres, directions);
          points.clear();
          points.add(point);
          metres = 0;
          directions = edge.directions(mode, from);
        }
      }
      from = forward ? edge.last() : edge.first();
      var next = graph.get(from);
      edge = next.size() == 2 ? (next.get(0) == edge ? next.get(1) : next.get(0)) : null;
    }
    retain(mode, points, metres, directions);
  }

  private void retain(int mode, List<Long> points, double metres, int directions) {
    if (metres < MIN_STRETCH[mode] || metres > 32_000) return;
    // Keep the routing vias inside the connected stretch, away from the junctions.
    long start = along(points, metres * .10), middle = along(points, metres * .50), finish = along(points, metres * .90);
    if (length(start, finish) < metres * .36) return;
    int key = (lon(middle) / CELL_SIZE << 12) | lat(middle) / CELL_SIZE;
    var best = cells.get(mode).computeIfAbsent(key, k -> new ArrayList<>(CELL_LIMIT));
    int usableMetres = (int) Math.round(metres * .8);
    for (var existing : best) {
      if (length(middle, existing.middle) < 500 &&
          (length(start, existing.start) + length(finish, existing.finish) < 1000 ||
           length(start, existing.finish) + length(finish, existing.start) < 1000)) return;
    }
    best.add(new Corridor(start, middle, finish, usableMetres, directions));
    best.sort(Comparator.comparingInt(Corridor::metres).reversed());
    if (best.size() > CELL_LIMIT) best.remove(best.size() - 1);
  }

  private static long along(List<Long> points, double metres) {
    for (int i = 1; i < points.size(); i++) {
      long a = points.get(i - 1), b = points.get(i);
      double length = length(a, b);
      if (length >= metres && length > 0) {
        double fraction = metres / length;
        return point((int) Math.round(lon(a) + (lon(b) - lon(a)) * fraction),
                     (int) Math.round(lat(a) + (lat(b) - lat(a)) * fraction));
      }
      metres -= length;
    }
    return points.get(points.size() - 1);
  }

  private void scan(Path segment, DataBuffers buffers) throws Exception {
    var tile = TILE.matcher(segment.getFileName().toString());
    if (!tile.matches()) throw new IllegalArgumentException("Unrecognised RD5 tile");
    int west = 180 + (tile.group(1).equals("W") ? -1 : 1) * Integer.parseInt(tile.group(2));
    int south = 90 + (tile.group(3).equals("S") ? -1 : 1) * Integer.parseInt(tile.group(4));
    var file = new PhysicalFile(segment.toFile(), buffers, metadata.lookupVersion, metadata.lookupMinorVersion);
    try {
      for (int lon = west; lon < west + 5; lon++) for (int lat = south; lat < south + 5; lat++) {
        var square = new OsmFile(file, lon, lat, buffers);
        if (!square.hasData()) continue;
        int step = file.divisor;
        for (int x = lon * step; x < (lon + 1) * step; x++) for (int y = lat * step; y < (lat + 1) * step; y++) {
          if (eligibility.size() >= 16_384) eligibility.clear();
          square.createMicroCache(x, y, buffers, this, this, true, null);
        }
        for (int mode = 0; mode < 3; mode++) collect(mode);
        edges.clear();
      }
    } finally { file.close(); }
    System.out.println("Indexed " + segment.getFileName());
  }

  private void write(Path output) throws Exception {
    int[] counts = cells.stream().mapToInt(type -> type.values().stream().mapToInt(List::size).sum()).toArray();
    if (Arrays.stream(counts).anyMatch(count -> count == 0)) throw new IllegalStateException("A corridor type is empty");
    try (var out = new DataOutputStream(new BufferedOutputStream(Files.newOutputStream(output)))) {
      out.writeInt(0x49464331); // IFC1
      for (int count : counts) out.writeInt(count);
      for (var type : cells) for (var cell : type.entrySet()) for (var corridor : cell.getValue()) {
        out.writeInt(cell.getKey());
        out.writeLong(corridor.start);
        out.writeLong(corridor.middle);
        out.writeLong(corridor.finish);
        out.writeShort(corridor.metres);
        out.writeByte(corridor.directions);
        out.writeByte(0);
      }
    }
    System.out.println("Quiet lanes, gravel corridors, MTB trails: " + Arrays.toString(counts));
  }

  public static void main(String[] args) throws Exception {
    Path root = Path.of(args[0]);
    var builder = new BuildCorridors(root);
    var buffers = new DataBuffers();
    try (var files = Files.list(root.resolve("segments"))) {
      for (Path segment : files.filter(path -> path.toString().endsWith(".rd5")).sorted().toList()) builder.scan(segment, buffers);
    }
    builder.write(Path.of(args[1]));
  }
}
