---
layout: post
title: >
    Convert OpenStreetMap data to GeoJSON 
tags: [GeoJSON, Spatial Data]
author: jan
excerpt_separator: <!--more-->
---

The [OpenStreepMap project](https://www.openstreetmap.org/) provides their database for download. This is called the _OSM planet_ [dataset](https://wiki.openstreetmap.org/wiki/Planet.osm). The dataset has a size of several gigabytes and contains the spatial data (e.g., roads, forests, buildings) of the whole world. The dataset is encoded in different data formats (e.g., _XML_ or _OpenStreetMap Protocolbuffer Binary Format_). To be able to import the dataset into systems that are capable of handling spatial data, the data needs to be converted into GeoJSON.

<!--more-->

## The OSM PBF Format

The [OpenStreetMap PBF format](https://wiki.openstreetmap.org/wiki/PBF_Format) uses the _Google Protocol Buffer format_ internally for encoding the data. The OpenStreetMap data model is mapped to these protocol buffer data structures. The data model consists of: (1) nodes, (2) ways, and (3) relations. 

* Nodes are the core elements of the data model. They consist of a coordinate in the two-dimensional space and an id. Typically, multiple nodes are used to describe the geometry of an entity. However, some special elements in the OpenStreetMap database are represented by only a single node (i.e., objects consisting of a single point in space, like a tree or a traffic signal). In addition, nodes can contain tags (key-value pairs). The tags contain properties of the node (e.g., the name of a tree). 
* A way is an ordered list of nodes. The nodes are referenced by the node id. 
* Relations consist of one or more nodes or ways and one or more tags (e.g., the surface of a street or the name of a river). 

[BBoxDB](https://bboxdb.org) includes a converter that converts _OpenStreetMap Protocolbuffer Binary Format (.osm.pbf)_ encoded data into GeoJSON encoded data. The converter reads the OpenStreetMap PBF format and resolves the nodes that are referenced in the ways and relations to actual nodes with coordinates. As soon as all nodes for a way or relation are resolved, the element is converted into GeoJSON and written to an output file.

## GeoJSON

In contrast to the `.osm.pdf` data format, GeoJSON elements consists of the complete geometry of the entity and additional properties. For example, a point (e.g., a tree) looks as follows in GeoJSON:

```json
{
    "id":31339954,
    "type":"Feature",
    "properties":{
        "natural":"tree"
    },
    "geometry":{
        "coordinates":[52.9744383,8.630228],
        "type":"Point"
    }
}
```

A more complex object (e.g., a road) looks as follows in GeoJSON (the `[...]` value replaces some of the coordinates to shorten the example):

```json
{
   "geometry":{
      "coordinates":[
         [13.397888700000001, 52.517639800000005],
         [13.3962856, 52.517546900000006],
         [13.395601800000001, 52.5175027],
         [13.3951066, 52.5174686],
         [13.3950258, 52.5174639],
         [13.394979300000001, 52.51746120000001],
         [...],
         [13.3925377,52.517365600000005],
         [13.390836400000001,52.517254300000005],
         [13.3906881,52.517270700000005]
      ],
      "type":"LineString"
   },
   "id":169195795,
   "type":"Feature",
   "properties":{
      "sidewalk":"right",
      "surface":"asphalt",
      "name:uk":"Унтер-ден-Лінден",
      "maxspeed":"50",
      "oneway":"yes",
      "ref":"B 2;B 5",
      "lit":"yes",
      "lanes":"3",
      "name":"Unter den Linden",
      "wikipedia":"de:Unter den Linden",
      "highway":"primary",
      "postal_code":"10117",
      "wikidata":"Q160899",
      "name:es":"Bulevar Bajo los Tilos",
      "name:zh":"菩提樹下大街"
   }
}
```

Besides of the coordinates, additional properties like the name of the road or the max speed are contained in the data structure.

## Converting Data

Download and build the converter

```shell
get clone https://github.com/jnidzwetzki/bboxdb.git
cd bboxdb
mvn package -DskipTests
```

The data converter can be started by executing the command `./bin/osm_data_converter.sh`. The converter takes some parameters that determine which data should be converted. An overview of these parameters is shown in the following table.


|   Parameter |  Type  | Description     |
|-------------|--------|-----------------|
`-backend`    | String | The storage engine that should be used (`jdbc_derby`, `jdbc_h2`, `bdb`, `sstable`). |
`-input`      | String | The filename of the input file. |
`-output`     | String | The name of the output folder. |
`-workfolder` | String | The name of the folder where the node database will be created. Multiple node databases could be used by specifying multiple folders, separated by `:`.|

Now, the dataset can be downloaded and converted.

```shell
wget https://ftp5.gwdg.de/pub/misc/openstreetmap/planet.openstreetmap.org/pbf/planet-latest.osm.pbf -O ~/planet-latest.osm.pbf

./bin/osm_data_converter.sh -input ~/planet-latest.osm.pbf -backend bdb -workfolder /tmp/converter -output /tmp/converted
```

This command takes a while. After the command finishes, you will find the output in the directory `/tmp/converted`. The converter generates multiple output files. To decide to which file an element belongs, a filter is applied to the GeoJSON element. These filters are responsible for grouping related entities into separate files (i.e., all trees are written into one file, whereas all roads are written into another file). 

```shell
nidzwetzki@home:~/bboxdb$ ls -l /tmp/converted
total 287632
-rw-rw-r-- 1 nidzwetzki nidzwetzki 147231652 Jan 18  2022 BUILDING
-rw-rw-r-- 1 nidzwetzki nidzwetzki  59064904 Jan 18  2022 ROAD
-rw-rw-r-- 1 nidzwetzki nidzwetzki   2674700 Jan 18  2022 TRAFFIC_SIGNAL
-rw-rw-r-- 1 nidzwetzki nidzwetzki  29284304 Jan 18  2022 TREE
-rw-rw-r-- 1 nidzwetzki nidzwetzki   1311644 Jan 18  2022 WATER
-rw-rw-r-- 1 nidzwetzki nidzwetzki    958855 Jan 18  2022 WOOD
```

These files can now be imported with software like [PostGIS](https://postgis.net/), [SpatialHadoop](http://spatialhadoop.cs.umn.edu/), or [Apache Sedona](https://sedona.apache.org/). If smaller areas of the world are needed, the converter can also process the OpenStreetMap database exerpts that are provided by [GeoFabrik](https://download.geofabrik.de/).

