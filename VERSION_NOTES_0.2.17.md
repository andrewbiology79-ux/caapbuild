# Version 0.2.17 - androidTest compile fix
CI (v0.2.16): normal build green; androidtest-compile.log: ScaleBenchmarkTest.kt lines 110 and 119,
arrayOf(String, Double, Int ...) inferred 'Comparable<*> & Serializable' for reified T. Fix: arrayOf<Any?>(...).
Only these two errors were reported; the Room 2.8 driver APIs used by the tests compiled.
