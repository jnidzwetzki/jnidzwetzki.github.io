---
layout: post
title: Query Plan Explorer
feature-img: "assets/img/plan_explorer_query2.svg"
img: "assets/img/plan_explorer_query2.svg"
date: 05 March 2025
---

My current side project is the [Query Plan Explorer](https://jnidzwetzki.github.io/planexplorer/), a tool that helps users understand when the PostgreSQL optimizer switches from one plan to another and how accurate the tuple estimations are. The software iterates over a one- or two-dimensional search space and plans the given query for each parameter combination. The output is a "drawing" that visualizes results such as the chosen plan, estimated and actual returned tuples, and the mismatch between these values. This project explores the intersection of art and query optimizer insights.

See also the [blog post](/2025/06/03/art-of-query-optimization.html) about this project.

{% include aligner.html images="planexplorer/expected_tuples.svg" %}
{% include aligner.html images="planexplorer/actual_tuples.svg" %}