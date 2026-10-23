package com.manhwa.engine

import eu.kanade.tachiyomi.source.model.Filter
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Converts a source's [Filter] list to the bridge's `FilterDto` JSON and back.
 *
 * Filters are objects the source defines (often its own subclasses carrying
 * values the UI never sees, like a tag id), so they can't be rebuilt from JSON.
 * Instead the UI edits a copy of the *state*, and [applyTo] writes that state
 * onto a fresh `getFilterList()` from the same source, position by position.
 * A position only takes the new state when its type and name still match, so
 * a source whose filter list changed between the two calls (some fill their
 * tag lists lazily) gets defaults rather than state meant for another filter.
 */
object FilterSerializer {

    fun toJson(filters: List<Filter<*>>): JsonArray = buildJsonArray {
        for (filter in filters) add(encode(filter))
    }

    private fun encode(filter: Filter<*>): JsonObject = when (filter) {
        is Filter.Header -> buildJsonObject {
            put("type", "header")
            put("name", filter.name)
        }
        is Filter.Separator -> buildJsonObject { put("type", "separator") }
        is Filter.Text -> buildJsonObject {
            put("type", "text")
            put("name", filter.name)
            put("state", filter.state)
        }
        is Filter.CheckBox -> buildJsonObject {
            put("type", "checkbox")
            put("name", filter.name)
            put("state", filter.state)
        }
        is Filter.TriState -> buildJsonObject {
            put("type", "tristate")
            put("name", filter.name)
            put("state", filter.state)
        }
        is Filter.Select<*> -> buildJsonObject {
            put("type", "select")
            put("name", filter.name)
            put("values", JsonArray(filter.values.map { JsonPrimitive(it.toString()) }))
            put("state", filter.state)
        }
        is Filter.Sort -> buildJsonObject {
            put("type", "sort")
            put("name", filter.name)
            put("values", JsonArray(filter.values.map { JsonPrimitive(it) }))
            val selection = filter.state
            put(
                "state",
                if (selection == null) {
                    JsonNull
                } else {
                    buildJsonObject {
                        put("index", selection.index)
                        put("ascending", selection.ascending)
                    }
                },
            )
        }
        is Filter.Group<*> -> buildJsonObject {
            put("type", "group")
            put("name", filter.name)
            put("filters", toJson(filter.state.filterIsInstance<Filter<*>>()))
        }
        // Not reachable with the vendored sealed hierarchy; keep the position
        // so later indices still line up.
        else -> buildJsonObject {
            put("type", "header")
            put("name", filter.name)
        }
    }

    /** Writes the state from [json] onto [filters] in place. */
    fun applyTo(json: JsonArray, filters: List<Filter<*>>) {
        filters.forEachIndexed { index, filter ->
            val dto = json.getOrNull(index)?.let { runCatching { it.jsonObject }.getOrNull() } ?: return@forEachIndexed
            val type = dto["type"]?.jsonPrimitive?.content
            val name = dto["name"]?.jsonPrimitive?.content
            if (type != typeOf(filter)) return@forEachIndexed
            if (name != null && name != filter.name) return@forEachIndexed
            decodeState(dto["state"], filter, dto)
        }
    }

    private fun typeOf(filter: Filter<*>): String = when (filter) {
        is Filter.Header -> "header"
        is Filter.Separator -> "separator"
        is Filter.Text -> "text"
        is Filter.CheckBox -> "checkbox"
        is Filter.TriState -> "tristate"
        is Filter.Select<*> -> "select"
        is Filter.Sort -> "sort"
        is Filter.Group<*> -> "group"
        else -> "header"
    }

    @Suppress("UNCHECKED_CAST")
    private fun decodeState(state: JsonElement?, filter: Filter<*>, dto: JsonObject) {
        when (filter) {
            is Filter.Text -> state?.jsonPrimitive?.content?.let { filter.state = it }
            is Filter.CheckBox -> state?.jsonPrimitive?.booleanOrNull?.let { filter.state = it }
            is Filter.TriState -> state?.jsonPrimitive?.intOrNull
                ?.takeIf { it in Filter.TriState.STATE_IGNORE..Filter.TriState.STATE_EXCLUDE }
                ?.let { filter.state = it }
            is Filter.Select<*> -> state?.jsonPrimitive?.intOrNull
                ?.takeIf { it in filter.values.indices }
                ?.let { (filter as Filter<Int>).state = it }
            is Filter.Sort -> filter.state = when (state) {
                null, is JsonNull -> null
                else -> {
                    val o = state.jsonObject
                    val i = o["index"]?.jsonPrimitive?.intOrNull
                    val asc = o["ascending"]?.jsonPrimitive?.booleanOrNull ?: false
                    if (i != null && i in filter.values.indices) Filter.Sort.Selection(i, asc) else filter.state
                }
            }
            is Filter.Group<*> -> dto["filters"]?.let { nested ->
                applyTo(nested.jsonArray, filter.state.filterIsInstance<Filter<*>>())
            }
            else -> Unit
        }
    }
}
