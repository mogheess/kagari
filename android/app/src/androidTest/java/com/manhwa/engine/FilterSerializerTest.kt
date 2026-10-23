package com.manhwa.engine

import androidx.test.ext.junit.runners.AndroidJUnit4
import eu.kanade.tachiyomi.source.model.Filter
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/** Filters shaped like a real source's (MangaTaro): select, sort, a checkbox group. */
private class Type : Filter.Select<String>("Type", arrayOf("All", "Manga", "Manhwa"))
private class Tag(name: String, val id: Int) : Filter.CheckBox(name)
private class Tags : Filter.Group<Tag>("Tags", listOf(Tag("Action", 7), Tag("Romance", 9)))
private class Order : Filter.Sort("Sort", arrayOf("Latest", "Popular"), Selection(0, false))
private class Query : Filter.Text("Author")
private class Genre : Filter.TriState("Isekai")

private fun freshList(): List<Filter<*>> =
    listOf(Filter.Header("Note"), Type(), Filter.Separator(), Tags(), Order(), Query(), Genre())

@RunWith(AndroidJUnit4::class)
class FilterSerializerTest {

    @Test
    fun editedStateIsAppliedToAFreshList() {
        val dto = FilterSerializer.toJson(freshList()).toString()
        // Edit like the UI does: change values in the JSON.
        val edited = dto
            .replace("\"name\":\"Type\",\"values\":[\"All\",\"Manga\",\"Manhwa\"],\"state\":0", "\"name\":\"Type\",\"values\":[\"All\",\"Manga\",\"Manhwa\"],\"state\":2")
            .replace("\"name\":\"Romance\",\"state\":false", "\"name\":\"Romance\",\"state\":true")
            .replace("\"state\":{\"index\":0,\"ascending\":false}", "\"state\":{\"index\":1,\"ascending\":true}")
            .replace("\"name\":\"Author\",\"state\":\"\"", "\"name\":\"Author\",\"state\":\"Oda\"")
            .replace("\"name\":\"Isekai\",\"state\":0", "\"name\":\"Isekai\",\"state\":2")

        val target = freshList()
        FilterSerializer.applyTo(Json.parseToJsonElement(edited).jsonArray, target)

        assertEquals(2, (target[1] as Type).state)
        val tags = (target[3] as Tags).state
        assertEquals(listOf(false, true), tags.map { it.state })
        assertEquals(9, tags.first { it.state }.id)
        assertEquals(Filter.Sort.Selection(1, true), (target[4] as Order).state)
        assertEquals("Oda", (target[5] as Query).state)
        assertEquals(Filter.TriState.STATE_EXCLUDE, (target[6] as Genre).state)
    }

    @Test
    fun mismatchedPositionsKeepDefaults() {
        // The source's list changed shape: a filter was inserted at the front.
        val stale = FilterSerializer.toJson(listOf(Type())).toString().replace("\"state\":0", "\"state\":2")
        val target = listOf<Filter<*>>(Query(), Type())
        FilterSerializer.applyTo(Json.parseToJsonElement(stale).jsonArray, target)
        assertEquals("", (target[0] as Query).state)
        assertEquals(0, (target[1] as Type).state)
    }

    @Test
    fun outOfRangeValuesAreIgnored() {
        val bad = FilterSerializer.toJson(listOf(Type())).toString().replace("\"state\":0", "\"state\":99")
        val target = listOf<Filter<*>>(Type())
        FilterSerializer.applyTo(Json.parseToJsonElement(bad).jsonArray, target)
        assertEquals(0, (target[0] as Type).state)
    }
}
