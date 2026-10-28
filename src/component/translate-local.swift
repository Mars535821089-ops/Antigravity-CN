import Foundation
import Translation
@main struct LocalTranslator {
 static func main() async throws {
  let source = Locale.Language(identifier: "en")
  let target = Locale.Language(identifier: "zh-Hans")
  let availability = LanguageAvailability(preferredStrategy: .lowLatency)
  let status = await availability.status(from: source, to: target)
  print("LANGUAGE_STATUS \(status)")
  guard status == .installed else { print("NO_INSTALLED_LANGUAGE_PAIR"); return }
  let session = TranslationSession(installedSource: source, target: target, preferredStrategy: .lowLatency)
  if CommandLine.arguments.count < 3 {
   let response = try await session.translate("Unavailable")
   print("TRANSLATION_TEST \(response.targetText)")
   return
  }
  let input = URL(fileURLWithPath: CommandLine.arguments[1])
  let output = URL(fileURLWithPath: CommandLine.arguments[2])
  let strings = try JSONDecoder().decode([String].self, from: Data(contentsOf: input))
  var result: [String:String] = [:]
  for offset in stride(from:0,to:strings.count,by:30) {
   let slice = Array(strings[offset..<min(offset+30,strings.count)])
   let requests = slice.enumerated().map { index, text in TranslationSession.Request(sourceText:text,clientIdentifier:String(index)) }
   for try await response in session.translate(batch: requests) {
    guard let id = response.clientIdentifier, let index = Int(id) else { continue }
    result[slice[index]] = response.targetText
   }
   try JSONEncoder().encode(result).write(to:output,options:.atomic)
   print("PROGRESS \(result.count)/\(strings.count)")
   fflush(stdout)
  }
 }
}
