/*
 * Child-first classloader adapted from Mihon/Tachiyomi's extension classloader
 * (https://github.com/mihonapp/mihon), licensed under the Apache License 2.0.
 * Modified for Kagari. See NOTICE for attribution and LICENSE for terms.
 */
package com.manhwa.engine.loader

import dalvik.system.PathClassLoader
import java.io.IOException
import java.io.InputStream
import java.net.URL
import java.util.Enumeration

/**
 * A parent-last class loader that tries, in order:
 *  1. the system class loader,
 *  2. this (child) class loader's own dex,
 *  3. the parent class loader.
 *
 * Ported from Mihon (Apache 2.0) — see NOTICE. Extensions bundle their own
 * copies of some library code, so loading their classes child-first avoids
 * clashing with the host's versions while still resolving the host-provided
 * `eu.kanade.tachiyomi.source.*` API from the parent.
 */
class ChildFirstPathClassLoader(
    dexPath: String,
    librarySearchPath: String?,
    parent: ClassLoader,
) : PathClassLoader(dexPath, librarySearchPath, parent) {

    private val systemClassLoader: ClassLoader? = getSystemClassLoader()

    override fun loadClass(name: String?, resolve: Boolean): Class<*> {
        var c = findLoadedClass(name)

        if (c == null && systemClassLoader != null) {
            try {
                c = systemClassLoader.loadClass(name)
            } catch (_: ClassNotFoundException) {
            }
        }

        if (c == null) {
            c = try {
                findClass(name)
            } catch (_: ClassNotFoundException) {
                super.loadClass(name, resolve)
            }
        }

        if (resolve) {
            resolveClass(c)
        }

        return c
    }

    override fun getResource(name: String?): URL? {
        return systemClassLoader?.getResource(name)
            ?: findResource(name)
            ?: super.getResource(name)
    }

    override fun getResources(name: String?): Enumeration<URL> {
        val systemUrls = systemClassLoader?.getResources(name)
        val localUrls = findResources(name)
        val parentUrls = parent?.getResources(name)
        val urls = buildList {
            while (systemUrls?.hasMoreElements() == true) add(systemUrls.nextElement())
            while (localUrls?.hasMoreElements() == true) add(localUrls.nextElement())
            while (parentUrls?.hasMoreElements() == true) add(parentUrls.nextElement())
        }

        return object : Enumeration<URL> {
            val iterator = urls.iterator()
            override fun hasMoreElements() = iterator.hasNext()
            override fun nextElement() = iterator.next()
        }
    }

    override fun getResourceAsStream(name: String?): InputStream? {
        return try {
            getResource(name)?.openStream()
        } catch (_: IOException) {
            null
        }
    }
}
