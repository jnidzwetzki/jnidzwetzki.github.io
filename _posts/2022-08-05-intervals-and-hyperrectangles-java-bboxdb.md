---
layout: post
title: >
    Processing Intervals and Hyperrectangles in Java with BBoxDB Commons
tags: [Howto, Java]
author: jan
excerpt_separator: <!--more-->
---

[BBoxDB](https://github.org/jnidzwetzki/bboxdb) is a distributed key-bounding-box-value store written in Java. The software provides the `bboxdb-commons` package that contains some helper classes for handling and processing spatial data. Some of these classes can be used to process intervals and hyperrectangles in Java. This post gives some practical examples how these classes can be used.

<!--more-->

## Installation

The `.jar` files of bboxdb-commons can be obtained from (Maven Central)[https://search.maven.org/] via tools like Gradle or Maven. When Maven is used, the following code snippet can be used to integrate the bboxdb-commons artifact into an own project:

```xml
<dependency>
    <groupId>org.bboxdb</groupId>
    <artifactId>bboxdb-commons</artifactId>
    <version>0.9.9</version>
</dependency>
```

## Intervals

After the bboxdb-commons `.jar` file is integrated into the project, new intervals (instances of the class `DoubleInterval`) can be created. The class has two primary constructors. Both constructors accept the interval's start and endpoint as double values. The second constructor also allows determining whether or not the start and the endpoint are included in the interval. Using the second constructor, open (the end and the start point are not included), half-open (the end or the start point is not included), and closed (the end and the start points are included) intervals can be constructed.

```java
// The start and the endpoint is included in the interval
DoubleInterval interval1 = new DoubleInterval(1.0,  5.0);

// The start point is not included in the interval. The endpoint is included
DoubleInterval interval2 = new DoubleInterval(2.5, 10.00, false, true);
```

At these intervals, additional methods are defined.

### Included Points
For instance, the method `isPointIncluded` can be used to test if a certain point is included in the interval or not. 

```java
boolean interval1.isPointIncluded(3.1);
```

### Coverage
The method `isCovering` returns true if the first interval covers the second interval. For example, the interval `[1, 10]` covers the interval `[2, 5]`, whereas the interval `[1, 10]` does not cover the interval `[5, 20]`. 

```java
boolean interval1.isCovering(interval2)
```

### Intersection
The method `getIntersection` returns the intersection of two intervals. For example, the intersection of the intervals `[1, 5]` and `[3, 10]` is '[3, 5]`. 

```java
DoubleInterval interval1.getIntersection(interval2);
```

## Hyperrectangles
A hyperrectangle is the generalized version of the regular rectangle for _n-dimensions_. So, a hyperrectangle could be a rectangle in the 4, 5, 6, or 100-dimensional space. The class `Hyperrectangle` of the `bboxdb-commons` package allows to create these structures and offers some method for processing them.

The `Hyperrectangle` class offers several constructors to create hyperrectangles. The simplest one is a constructor that accepts a variable number of double values. An even number of values must be passed to the constructor since a start, and an end point is needed for each dimension of the hyperrectangle. For example, this can be done as follows:

```java
// One-dimensional hyperrectangle
Hyperrectangle rectangle1 = new Hyperrectangle(1, 10);

//Two-dimensional hyperrectangle
Hyperrectangle rectangle2 = new Hyperrectangle(1, 10, 1, 10);

//Three-dimensional hyperrectangle
Hyperrectangle rectangle3 = new Hyperrectangle(1, 10, 1, 10, 1, 10);
```

Internally, the `Hyperrectangle` class stores the start and endpoints of the hyperrectangle of each dimension in a `DoubleInterval`. A second constructor is offered, which allows constructing a hyperrectangle from a list of `DoubleIntervals`. Using this constructor, also special `Hyperrectangles` consisting of intervals of open, half-open, and closed intervals can be constructed.

```java
// Create a two-dimensional hyperrectangle from two DoubleIntervals
DoubleInterval interval1 = new DoubleInterval(1.0,  5.0);
DoubleInterval interval2 = new DoubleInterval(2.5, 10.00, false, true);
Hyperrectangle rectangle1 = new Hyperrectangle(Arrays.asList(interval1, interval2));
```

### Volume

On these hyperrectangles, different service methods are implemented. By using the method `getVolume()` the volume of a hyperrectangle can be calculated.

```java
double rectangle1.getVolume();
```

### Enlargement 

An existing hyperrectangle can also be enlarged. This can be done either by a certain value, a factor, or a percentage. By calling the method `enlargeByValue`, a certain value is added to each dimension of the hyperrectangle. By calling the method `enlargeByFactor`, each dimension is enlarged by a certain factor. By using the `scaleVolumeByPercentage` method, the complete hyperrectangle can be scaled by a certain percentage.

```java
Hyperrectangle rectangle1.enlargeByValue(value);
Hyperrectangle rectangle1.enlargeByFactor(factor);
Hyperrectangle rectangle1.scaleVolumeByPercentage(percentage);
```

### Intersection

Also, the intersection of hyperrectangles can be calculated. The method `intersects` returns a boolean that indicates if two bounding boxes are intersecting (share a common part of the space). By calling the method `getIntersection` a hyperrectangle is returned that covers the common part of the two hyperrectangles.

```java
boolean rectangle1.intersects(otherBoundingBox);
Hyperrectangle rectangle1.getIntersection(otherBox);
```

### Coverage

By calling the method `isCovering` a boolean value is returned that describes whether or not the hyperectangle of the argument is covered completely by the other hyperectangle.

```java
boolean rectangle1.isCovering(otherBox);
```
