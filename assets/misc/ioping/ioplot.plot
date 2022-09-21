set autoscale
set grid x y

set ylabel "I/O latency (us)"
set xlabel "I/O request number"
set term svg

set output "/dev/null"
set title "EBS GP2 volume attachted to a t3a.small EC2 instance" 
plot 'gp2.out' using (column(0)):($6/1000)
min_y = GPVAL_DATA_Y_MIN
max_y = GPVAL_DATA_Y_MAX
f(x) = mean_y
fit f(x) 'gp2.out' using (column(0)):($6/1000) via mean_y

stddev_y = sqrt(FIT_WSSR / (FIT_NDF + 1 ))

set label 1 gprintf("Minimum = %g", min_y) at 20, 100
set label 2 gprintf("Average = %g", mean_y) at 20, 1650
set label 3 gprintf("Maximum = %g", max_y) at 20, 1720
set label 4 gprintf("Standard deviation = %g", stddev_y) at 20, 1790

set yrange [0:max_y+300]
set output "gp2.svg"
plot min_y with filledcurves y1=mean_y lt 1 lc rgb "#bbbbdd" title "< Average", \
     max_y with filledcurves y1=mean_y lt 1 lc rgb "#bbddbb" title "> Average", \
     'gp2.out' using (column(0)):($6/1000) pt 2 title "", \
     mean_y lt 1 title "Average"

reset
set output "/dev/null"
set title "EBS GP3 volume attachted to a t3a.small EC2 instance" 
plot 'gp3.out' using (column(0)):($6/1000)
min_y = GPVAL_DATA_Y_MIN
max_y = GPVAL_DATA_Y_MAX
f(x) = mean_y
fit f(x) 'gp3.out' using (column(0)):($6/1000) via mean_y

stddev_y = sqrt(FIT_WSSR / (FIT_NDF + 1 ))

set label 1 gprintf("Minimum = %g", min_y) at 20, 100
set label 2 gprintf("Average = %g", mean_y) at 20, 2700
set label 3 gprintf("Maximum = %g", max_y) at 20, 2800
set label 4 gprintf("Standard deviation = %g", stddev_y) at 20, 2900

set yrange [0:max_y+500]
set output "gp3.svg"
plot min_y with filledcurves y1=mean_y lt 1 lc rgb "#bbbbdd" title "< Average", \
     max_y with filledcurves y1=mean_y lt 1 lc rgb "#bbddbb" title "> Average", \
     'gp3.out' using (column(0)):($6/1000) pt 2 title "", \
     mean_y lt 1 title "Average"


