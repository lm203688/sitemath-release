import AppIntents
import Foundation

// SiteMath：坡度/方量/45° 偏移都跟 App 内 20 个工具用同一组关系式。
// 只做「纯算术」意图，不猜业务假设，避免与 App 内结果不一致。
@available(iOS 16.0, *)
struct SlopeIntent: AppIntent {
  static var title: LocalizedStringResource = "Slope from rise and run"
  static var description: IntentDescription? = IntentDescription(
    "Turns a rise-over-run measurement into pitch in degrees, slope in percent, and the diagonal length."
  )
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Rise", description: "Vertical change, same unit as run.")
  var rise: Double

  @Parameter(title: "Run", description: "Horizontal change, same unit as rise.")
  var run: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Slope for \(\.$rise) rise over \(\.$run) run")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard run != 0 else {
      return .result(dialog: "Run can't be zero — that's a vertical line.")
    }
    let ratio = abs(rise / run)
    let degrees = atan(ratio) * 180 / .pi
    let percent = ratio * 100
    let diagonal = (rise * rise + run * run).squareRoot()
    let d = String(format: "%.1f", degrees)
    let p = String(format: "%.1f", percent)
    let g = String(format: "%.2f", diagonal)
    return .result(dialog: "Pitch \(d)°, slope \(p)%, diagonal \(g).")
  }
}

@available(iOS 16.0, *)
struct ConcreteVolumeIntent: AppIntent {
  static var title: LocalizedStringResource = "Concrete volume for a slab"
  static var description: IntentDescription? = IntentDescription(
    "Converts slab length, width and thickness into cubic yards plus 80 lb bag count, with an optional waste allowance."
  )
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Length", description: "Feet.")
  var lengthFeet: Double

  @Parameter(title: "Width", description: "Feet.")
  var widthFeet: Double

  @Parameter(title: "Thickness", description: "Inches.")
  var thicknessInches: Double

  @Parameter(title: "Waste", description: "Extra percent for uneven subgrade.", default: 10)
  var wastePercent: Int

  static var parameterSummary: some ParameterSummary {
    Summary("Concrete for \(\.$lengthFeet) × \(\.$widthFeet) ft at \(\.$thicknessInches) in")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard lengthFeet > 0, widthFeet > 0, thicknessInches > 0 else {
      return .result(dialog: "Length, width and thickness all need to be greater than zero.")
    }
    let cubicFeet = lengthFeet * widthFeet * (thicknessInches / 12)
    let wasteFactor = 1 + Double(max(wastePercent, 0)) / 100
    let cubicYards = cubicFeet * wasteFactor / 27
    let bags = Int(ceil(cubicFeet * wasteFactor / 0.6))
    let y = String(format: "%.2f", cubicYards)
    let f = String(format: "%.1f", cubicFeet * wasteFactor)
    return .result(dialog: "\(f) cu ft with \(wastePercent)% waste — order \(y) cu yd, or about \(bags) bags of 80 lb mix (0.6 cu ft per bag).")
  }
}

@available(iOS 16.0, *)
struct OffsetTravelIntent: AppIntent {
  static var title: LocalizedStringResource = "45-degree offset travel"
  static var description: IntentDescription? = IntentDescription(
    "Turns a pipe offset into fitting-to-fitting travel and the rolled run for a 45° elbow pair (travel = offset × 1.414)."
  )
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Offset", description: "Perpendicular offset, inches.")
  var offsetInches: Double

  static var parameterSummary: some ParameterSummary {
    Summary("45° travel for a \(\.$offsetInches) in offset")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard offsetInches > 0 else {
      return .result(dialog: "Offset needs to be greater than zero.")
    }
    let travel = offsetInches * 2.0.squareRoot()
    let t = String(format: "%.2f", travel)
    let r = String(format: "%.2f", offsetInches)
    return .result(dialog: "For a \(String(format: "%.2f", offsetInches)) in offset with 45° elbows: travel \(t) in, rolled run \(r) in.")
  }
}

@available(iOS 16.0, *)
struct OpenSiteMathIntent: AppIntent {
  static var title: LocalizedStringResource = "Open SiteMath"
  static var description: IntentDescription? = IntentDescription(
    "Opens SiteMath's calculators: pipe grades, offsets, electrical and gas tables."
  )
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    return .result()
  }
}

@available(iOS 16.0, *)
struct SiteMathShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: SlopeIntent(),
      phrases: [
        "Calculate slope in \(.applicationName)",
        "What pitch is that grade in \(.applicationName)",
      ],
      shortTitle: "Slope",
      systemImageName: "ruler"
    )
    AppShortcut(
      intent: ConcreteVolumeIntent(),
      phrases: [
        "How much concrete in \(.applicationName)",
        "Concrete for a slab in \(.applicationName)",
      ],
      shortTitle: "Concrete",
      systemImageName: "square.stack.3d.up"
    )
    AppShortcut(
      intent: OffsetTravelIntent(),
      phrases: ["Pipe offset in \(.applicationName)"],
      shortTitle: "45° offset",
      systemImageName: "arrow.triangle.branch"
    )
    AppShortcut(
      intent: OpenSiteMathIntent(),
      phrases: ["Open \(.applicationName)"],
      shortTitle: "Open SiteMath",
      systemImageName: "function"
    )
  }
}


// MARK: - Material entity (Spotlight + Siri parameter)

// 每种材料的"一单位铺多少平方英尺"是工地上真正要换算的那个数，写死在这里，
// 意图就不依赖 app 里的报价库。
@available(iOS 16.0, *)
struct MaterialEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = TypeDisplayRepresentation(name: "Material")
  static var defaultQuery = MaterialQuery()

  let id: String
  let summary: String
  /// Square feet covered by one purchase unit at the stated lift.
  let squareFeetPerUnit: Double
  /// Purchase unit, e.g. "cu yd" or "sq ft".
  let unitLabel: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(summary)", subtitle: "\(Int(squareFeetPerUnit)) sq ft per \(unitLabel)")
  }

  static let all: [MaterialEntity] = [
    MaterialEntity(id: "concrete-4in", summary: "Concrete, 4 in slab", squareFeetPerUnit: 81, unitLabel: "cu yd"),
    MaterialEntity(id: "gravel-2in", summary: "Gravel, 2 in lift", squareFeetPerUnit: 162, unitLabel: "cu yd"),
    MaterialEntity(id: "sand-2in", summary: "Sand, 2 in lift", squareFeetPerUnit: 162, unitLabel: "cu yd"),
    MaterialEntity(id: "mulch-3in", summary: "Mulch, 3 in", squareFeetPerUnit: 108, unitLabel: "cu yd"),
    MaterialEntity(id: "sod", summary: "Sod", squareFeetPerUnit: 1, unitLabel: "sq ft"),
  ]
}

@available(iOS 18.0, *)
extension MaterialEntity: IndexedEntity {}

@available(iOS 16.0, *)
struct MaterialQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [MaterialEntity] {
    MaterialEntity.all.filter { identifiers.contains($0.id) }
  }

  func suggestedEntities() async throws -> [MaterialEntity] {
    MaterialEntity.all
  }

  func defaultResult() async -> MaterialEntity? {
    MaterialEntity.all.first
  }
}

@available(iOS 16.0, *)
struct MaterialUnitsIntent: AppIntent {
  static var title: LocalizedStringResource = "Material units for an area"
  static var description = IntentDescription("How many purchase units a given area needs, rounded up.")

  @Parameter(title: "Material")
  var material: MaterialEntity

  @Parameter(title: "Area in square feet")
  var areaSquareFeet: Double

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard areaSquareFeet > 0 else {
      return .result(dialog: IntentDialog(stringLiteral: "Area has to be greater than zero."))
    }
    let raw = areaSquareFeet / material.squareFeetPerUnit
    let units = Int((raw * 100).rounded(.up) / 100 == raw ? raw.rounded(.up) : raw.rounded(.up))
    let text = "\(material.summary): about \(units) \(material.unitLabel) for \(Int(areaSquareFeet)) sq ft (one \(material.unitLabel) covers \(Int(material.squareFeetPerUnit) sq ft)."
    return .result(dialog: IntentDialog(stringLiteral: text))
  }
}
