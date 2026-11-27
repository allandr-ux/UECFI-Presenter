package org.uecfi.presenter.data

import kotlin.math.abs
import kotlin.math.min
import org.uecfi.presenter.model.BibleBookModel
import org.uecfi.presenter.model.BibleVersionModel

data class RankedBibleBook(
  val book: BibleBookModel,
  val idx: Int,
  val score: Double,
)

/**
 * Port of Desktop `src/utils/bookSearch.ts` so book-name filtering on Android matches
 * the Desktop Bible tab (English names, abbreviations, Tagalog/Kapampangan aliases,
 * subsequence matching, and typo tolerance).
 */
object BibleBookSearch {
  private val CANONICAL_ALIASES: List<List<String>> = listOf(
    listOf("genesis", "gen", "ge", "gn"),
    listOf("exodus", "exod", "ex", "exodo"),
    listOf("leviticus", "lev", "le", "lv", "levitico"),
    listOf("numbers", "num", "nu", "nm", "bilang", "numero"),
    listOf("deuteronomy", "deut", "dt", "deuteronomio"),
    listOf("joshua", "josh", "jos", "josue"),
    listOf("judges", "judg", "jdg", "hukom"),
    listOf("ruth", "ru", "rut"),
    listOf("1 samuel", "1sam", "1sa", "1s"),
    listOf("2 samuel", "2sam", "2sa", "2s"),
    listOf("1 kings", "1kgs", "1ki", "1k", "1 hari"),
    listOf("2 kings", "2kgs", "2ki", "2k", "2 hari"),
    listOf("1 chronicles", "1chr", "1ch", "1 cronica"),
    listOf("2 chronicles", "2chr", "2ch", "2 cronica"),
    listOf("ezra", "ezr", "esdras"),
    listOf("nehemiah", "neh", "ne", "nehemias"),
    listOf("esther", "est", "ester"),
    listOf("job", "jb"),
    listOf("psalms", "psalm", "ps", "psa", "awit", "salmo", "dalit"),
    listOf("proverbs", "prov", "pr", "kawikaan", "kasebian"),
    listOf("ecclesiastes", "eccl", "ecc", "ec", "mangangaral", "eclesiastes"),
    listOf("song of solomon", "song", "sos", "canticle", "awit ng mga awit"),
    listOf("isaiah", "isa", "is", "isaias"),
    listOf("jeremiah", "jer", "je", "jeremias"),
    listOf("lamentations", "lam", "la", "panaghoy", "lamentaciones"),
    listOf("ezekiel", "ezek", "eze", "ezk", "ezequiel"),
    listOf("daniel", "dan", "da", "dn"),
    listOf("hosea", "hos", "ho", "oseas"),
    listOf("joel", "jl"),
    listOf("amos", "am"),
    listOf("obadiah", "obad", "ob", "abdias"),
    listOf("jonah", "jon", "jnh", "jonas"),
    listOf("micah", "mic", "mi", "miqueas"),
    listOf("nahum", "nah", "na"),
    listOf("habakkuk", "hab", "hb", "habacuc"),
    listOf("zephaniah", "zeph", "zep", "sofonia"),
    listOf("haggai", "hag", "hg", "hageo"),
    listOf("zechariah", "zech", "zec", "zacarias"),
    listOf("malachi", "mal", "ml", "malaquias"),
    listOf("matthew", "matt", "mt", "mateo", "mateu"),
    listOf("mark", "mk", "mr", "marcos"),
    listOf("luke", "lk", "lu", "lucas"),
    listOf("john", "jn", "jhn", "juan"),
    listOf("acts", "ac", "gawa", "ding dapat"),
    listOf("romans", "rom", "ro", "rm", "roma"),
    listOf("1 corinthians", "1cor", "1co", "1 corinto"),
    listOf("2 corinthians", "2cor", "2co", "2 corinto"),
    listOf("galatians", "gal", "ga", "galacia"),
    listOf("ephesians", "eph", "efeso"),
    listOf("philippians", "phil", "php", "filipos"),
    listOf("colossians", "col", "colosas"),
    listOf("1 thessalonians", "1thess", "1th", "1 tesalonica"),
    listOf("2 thessalonians", "2thess", "2th", "2 tesalonica"),
    listOf("1 timothy", "1tim", "1ti", "1 timoteo"),
    listOf("2 timothy", "2tim", "2ti", "2 timoteo"),
    listOf("titus", "tit", "tito"),
    listOf("philemon", "phlm", "phm", "filemon"),
    listOf("hebrews", "heb", "hebreo"),
    listOf("james", "jas", "jm", "santiago"),
    listOf("1 peter", "1pet", "1pe", "1p", "1 pedro"),
    listOf("2 peter", "2pet", "2pe", "2p", "2 pedro"),
    listOf("1 john", "1jn", "1jhn", "1jo", "1 juan"),
    listOf("2 john", "2jn", "2jhn", "2jo", "2 juan"),
    listOf("3 john", "3jn", "3jhn", "3jo", "3 juan"),
    listOf("jude", "jud", "judas"),
    listOf("revelation", "rev", "re", "apocalypse", "apocalipsis", "pahayag", "kapahayagan"),
  )

  private val NON_ALNUM_SPACE = Regex("[^a-z0-9\\s]")
  private val MULTI_SPACE = Regex("\\s+")
  private val NON_ALNUM = Regex("[^a-z0-9]")

  private fun normalize(str: String): String =
    str.lowercase().replace(NON_ALNUM_SPACE, " ").replace(MULTI_SPACE, " ").trim()

  private fun compact(str: String): String =
    str.lowercase().replace(NON_ALNUM, "")

  private fun subsequenceScore(needle: String, haystack: String): Double {
    if (needle.isEmpty()) return 0.0
    var nIdx = 0
    var consecutive = 0
    var bonus = 0.0
    for (hIdx in haystack.indices) {
      if (nIdx >= needle.length) break
      if (haystack[hIdx] == needle[nIdx]) {
        consecutive++
        bonus += consecutive * 2
        if (hIdx == 0) bonus += 6
        nIdx++
      } else {
        consecutive = 0
      }
    }
    return if (nIdx == needle.length) {
      30.0 + bonus - (haystack.length - needle.length) * 0.2
    } else {
      0.0
    }
  }

  private fun levenshtein(a: String, b: String): Int {
    if (abs(a.length - b.length) > 3) return 99
    val dp = Array(a.length + 1) { IntArray(b.length + 1) }
    for (i in 0..a.length) dp[i][0] = i
    for (j in 0..b.length) dp[0][j] = j
    for (i in 1..a.length) {
      for (j in 1..b.length) {
        val cost = if (a[i - 1] == b[j - 1]) 0 else 1
        dp[i][j] = min(min(dp[i - 1][j] + 1, dp[i][j - 1] + 1), dp[i - 1][j - 1] + cost)
      }
    }
    return dp[a.length][b.length]
  }

  private fun scoreTarget(qNorm: String, qCompact: String, target: String): Double {
    val tNorm = normalize(target)
    val tCompact = compact(target)
    if (tCompact.isEmpty()) return 0.0

    if (tNorm == qNorm || tCompact == qCompact) return 1000.0
    if (tNorm.startsWith(qNorm) || tCompact.startsWith(qCompact)) return (850 - tCompact.length).toDouble()

    val words = tNorm.split(' ')
    if (words.any { it.startsWith(qNorm) }) return 700.0

    if (tNorm.contains(qNorm) || tCompact.contains(qCompact)) {
      return (600 - tCompact.indexOf(qCompact) * 2).toDouble()
    }

    val sub = subsequenceScore(qCompact, tCompact)
    if (sub > 0.0) return 300.0 + sub

    if (qCompact.length >= 3) {
      val sliceEnd = min(tCompact.length, qCompact.length + 2)
      val dist = levenshtein(qCompact, tCompact.substring(0, sliceEnd))
      if (dist <= 2) return (220 - dist * 40).toDouble()
    }
    return 0.0
  }

  fun smartSearchBooks(
    books: List<BibleBookModel>,
    query: String,
    secondaryBible: BibleVersionModel? = null,
  ): List<RankedBibleBook> {
    val qNorm = normalize(query)
    val qCompact = compact(query)
    if (qCompact.isEmpty()) {
      return books.mapIndexed { idx, book -> RankedBibleBook(book, idx, 1.0) }
    }

    val ranked = mutableListOf<RankedBibleBook>()
    val hasCanonical66 = books.size == 66

    books.forEachIndexed { idx, book ->
      var best = scoreTarget(qNorm, qCompact, book.name)

      val secBook = secondaryBible?.books?.getOrNull(idx)
      if (secBook != null) {
        val secScore = scoreTarget(qNorm, qCompact, secBook.name)
        if (secScore > best) {
          best = secScore - 2.0
        }
      }

      if (hasCanonical66 && idx < CANONICAL_ALIASES.size) {
        for (alias in CANONICAL_ALIASES[idx]) {
          val aliasScore = scoreTarget(qNorm, qCompact, alias)
          if (aliasScore > best) {
            best = aliasScore - 5.0
          }
        }
      }

      if (best > 0.0) {
        ranked.add(RankedBibleBook(book, idx, best))
      }
    }

    ranked.sortWith(compareByDescending<RankedBibleBook> { it.score }.thenBy { it.idx })
    return ranked
  }
}
